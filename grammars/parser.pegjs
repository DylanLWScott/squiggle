{
    // Yikes... what a horrible import path.
    var ast = require("../../../src/ast");

    function foldLeft(f, z, xs) {
        return xs.reduce(function(acc, x) {
            return f(acc, x);
        }, z);
    }

    // Left-associative binary operator helper.
    function lbo(a, xs) {
        return foldLeft(function(acc, pair) {
            return ast.BinOp(ast.Operator(pair[0]), acc, pair[1]);
        }, a, xs);
    }
}

Program
    = _ "export" _ e:Expr _ { return ast.Module(e); }
    / _ e:Expr _            { return ast.Script(e); }

Keyword
    = "if" / "then" / "else"
    / "let" / "in"
    / "true" / "false"
    / "undefined" / "null"
    / "export"

Expr
    = a:Expr0 xs:((o:";" _ b:Expr0) { return [o, b]; })*
    { return lbo(a, xs); }

Expr0
    = "if"   _ p:Bop1
      "then" _ t:Expr
      "else" _ f:Expr
    { return ast.If(p, t, f); }
    / Expr1

Expr1
    = "let" _ "(" _ b:Bindings ")" _ "in" _ e:Expr
    { return ast.Let(b, e); }
    / Expr2

Bindings
    = b:Binding bs:(("," _ b2:Binding) { return b2; })*
    { return [b].concat(bs); }

Binding
    = i:Identifier "=" _ e:Expr
    { return ast.Binding(i, e); }

Expr2
    = Bop1

Bop1 = a:Bop3 xs:((o:"|>"                                   _ b:Bop3)  { return [o, b]; })* { return lbo(a, xs); }
Bop3 = a:Bop4 xs:((o:("and" / "or")                         _ b:Bop4)  { return [o, b]; })* { return lbo(a, xs); }
Bop4 = a:Bop5 xs:((o:(">=" / "<=" / "<" / ">" / "=" / "!=") _ b:Bop5)  { return [o, b]; })* { return lbo(a, xs); }
Bop5 = a:Bop6 xs:((o:"++"                                   _ b:Bop6)  { return [o, b]; })* { return lbo(a, xs); }
Bop6 = a:Bop7 xs:((o:("+" / "-")                            _ b:Bop7)  { return [o, b]; })* { return lbo(a, xs); }
Bop7 = a:Bop8 xs:((o:("*" / "/")                            _ b:Bop8)  { return [o, b]; })* { return lbo(a, xs); }

Bop8 = Expr3

Expr3
    =   e:Expr4
        xs:(
            ("." _ i:Identifier) { return i; } /
            ("[" _ i:Expr "]" _) { return i; }
        )*
    { return foldLeft(ast.GetProperty, e, xs); }

Expr4
    = e:Expr5 xs:(("::" _ i:Identifier) { return i; })*
    { return foldLeft(ast.GetMethod, e, xs); }

Expr5
    = e:Expr6 calls:(
        ("." _ i:Identifier "(" _ xs:ListItems? ")" _)
        { return [i, xs || []]; }
    )*
    {
        return foldLeft(function(acc, call) {
            return ast.CallMethod(acc, call[0], call[1]);
        }, e, calls);
    }

Expr6
    = e:Expr7 calls:(("(" _ xs:ListItems? ")" _) { return xs || []; })*
    { return foldLeft(ast.Call, e, calls); }

Expr7
    = Literal
    / List
    / Map
    / Function
    / IdentExpr
    / ParenExpr

Literal "literal"
    = Number
    / String
    / True
    / False
    / Undefined
    / Null

IdentExpr
    = i:Identifier
    { return ast.IdentifierExpression(i); }

Function "function"
    = "~" _ m:Map? "(" _ p:Parameters? "|" _ e:Expr ")" _
    { return ast.Function(m || ast.Map([]), p || [], e); }

Parameters
    = p:Parameter ps:(("," _ p2: Parameter) { return p2; })*
    { return [p].concat(ps); }

Parameter
    = i:Identifier
    { return ast.Parameter(i); }

ParenExpr "parenthesized-expression"
    = "(" _ e:Expr ")" _
    { return e; }

List "list"
    = "[" _ xs:ListItems? "]" _
    { return ast.List(xs || []); }

ListItems
    = e:Expr es:(("," _ e2:Expr) { return e2; })*
    { return [e].concat(es); }

Map "map"
    = "{" _ xs:MapPairs? "}" _
    { return ast.Map(xs || []); }

MapPairs
    = p:Pair ps:(("," _ p2:Pair) { return p2; })*
    { return [p].concat(ps); }

Pair
    = k:Expr ":" _ v:Expr
    { return ast.Pair(k, v); }

Identifier "identifier"
    = i:$([_a-zA-Z][_a-zA-Z0-9]*) _
    { return ast.Identifier(i); }

True "true"
    = "true" _
    { return ast.True(); }

False "false"
    = "false" _
    { return ast.False(); }

Undefined "undefined"
    = "undefined" _
    { return ast.Undefined(); }

Null "null"
    = "null" _
    { return ast.Null(); }

Number "number"
    = n:$([0-9]+) _
    { return ast.Number(+n); }

String "string"
    = '"' s:$([^"\n]+) '"' _
    { return ast.String(s); }

_  = (WS / NL / Comment)*

WS "whitespace"
    = [\ \t]+

NL "newline"
    = [\n]+

Comment "comment"
    = "#" (!NL .)* NL
