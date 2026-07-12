/**
 * Safe KPI formula evaluator.
 *
 * Parses a restricted arithmetic grammar over metric names — NOT JavaScript.
 * There is no eval()/Function(): a hand-written tokenizer + recursive-descent
 * parser only accepts identifiers (metric keys), numeric literals, the operators
 * + - * /, unary minus, and parentheses. Anything else is rejected, so a user
 * cannot inject code.
 *
 *   grammar:
 *     expr   = term (('+' | '-') term)*
 *     term   = factor (('*' | '/') factor)*
 *     factor = NUMBER | IDENT | '(' expr ')' | ('+' | '-') factor
 *
 * Used on both the server (validate a definition before storing) and the client
 * (recompute a KPI widget live), so this module must stay dependency-free and
 * isomorphic.
 */

type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch as "+" });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      if ((num.match(/\./g) || []).length > 1)
        throw new Error(`invalid number "${num}"`);
      tokens.push({ type: "num", value: Number(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
      tokens.push({ type: "ident", value: id });
      continue;
    }
    throw new Error(`unexpected character "${ch}"`);
  }
  return tokens;
}

type Node =
  | { kind: "num"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "+" | "-"; operand: Node }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): Node {
    const node = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error("unexpected trailing input");
    }
    return node;
  }

  private expr(): Node {
    let left = this.term();
    let t = this.peek();
    while (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.next();
      const right = this.term();
      left = { kind: "binary", op: t.value, left, right };
      t = this.peek();
    }
    return left;
  }

  private term(): Node {
    let left = this.factor();
    let t = this.peek();
    while (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
      this.next();
      const right = this.factor();
      left = { kind: "binary", op: t.value, left, right };
      t = this.peek();
    }
    return left;
  }

  private factor(): Node {
    const t = this.next();
    if (!t) throw new Error("unexpected end of formula");
    if (t.type === "num") return { kind: "num", value: t.value };
    if (t.type === "ident") return { kind: "ident", name: t.value };
    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      return { kind: "unary", op: t.value, operand: this.factor() };
    }
    if (t.type === "op" && t.value === "(") {
      const inner = this.expr();
      const close = this.next();
      if (!close || close.type !== "op" || close.value !== ")") {
        throw new Error("missing closing parenthesis");
      }
      return inner;
    }
    throw new Error(`unexpected token "${"value" in t ? t.value : ""}"`);
  }
}

function collectIdents(node: Node, out: Set<string>): void {
  switch (node.kind) {
    case "ident":
      out.add(node.name);
      break;
    case "unary":
      collectIdents(node.operand, out);
      break;
    case "binary":
      collectIdents(node.left, out);
      collectIdents(node.right, out);
      break;
  }
}

function evalNode(node: Node, vars: Record<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "ident": {
      const v = vars[node.name];
      return typeof v === "number" && Number.isFinite(v) ? v : NaN;
    }
    case "unary":
      return node.op === "-" ? -evalNode(node.operand, vars) : evalNode(node.operand, vars);
    case "binary": {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return r === 0 ? NaN : l / r;
      }
    }
  }
}

export interface ParsedFormula {
  ok: boolean;
  error?: string;
  /** Distinct metric identifiers referenced by the formula. */
  metrics: string[];
}

/** Validate a formula and return the metric names it references. */
export function parseFormula(src: string): ParsedFormula {
  try {
    if (!src.trim()) return { ok: false, error: "formula is empty", metrics: [] };
    const ast = new Parser(tokenize(src)).parse();
    const set = new Set<string>();
    collectIdents(ast, set);
    return { ok: true, metrics: Array.from(set) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), metrics: [] };
  }
}

/**
 * Evaluate a formula against a map of metric -> value. Returns null when the
 * formula is invalid, references a missing metric, or the result isn't finite
 * (e.g. division by zero).
 */
export function evaluateFormula(
  src: string,
  vars: Record<string, number>
): number | null {
  try {
    const ast = new Parser(tokenize(src)).parse();
    const result = evalNode(ast, vars);
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
