var isObject = require("lodash/lang/isObject");
var flatten = require("lodash/array/flatten");
var jsbeautify = require("js-beautify");
var esprima = require("esprima");

var es = require("./es");
var ast = require("./ast");
var match = require("./match");
var fileWrapper = require("./file-wrapper");

function transformAst(node) {
    if (!isObject(node)) {
        throw new Error("Not a node: " + jsonify(node));
    }
    if (handlers.hasOwnProperty(node.type)) {
        return handlers[node.type](node);
    }
    throw new Error("Unknown AST node: " + jsonify(node));
}

function unary(f) {
    return function(x) {
        return f(x);
    };
}

function mapLastSpecial(f, g, xs) {
    var n = xs.length;
    var ys = xs.slice(0, n - 1).map(unary(f));
    var y = unary(g)(xs[n - 1]);
    return ys.concat([y]);
}

function freeze(esNode) {
    return es.CallExpression(es.Identifier("sqgl$$freeze"), [esNode]);
}

function jsonify(x) {
    return JSON.stringify(x);
}

function literal(node) {
    return es.Literal(node.data);
}

function assertBoolean(x) {
    return transformAst(
        ast.Call(
            ast.Identifier('sqgl$$assertBoolean'),
            [x]
        )
    );
}

function coerceIdentToString(node) {
    if (node.type === "Identifier") {
        return ast.String(node.data);
    }
    return node;
}

var PREDEF = require("./predef-ast");

function moduleExportsEq(x) {
    return es.AssignmentExpression('=',
        es.MemberExpression(false,
            es.Identifier('module'),
            es.Identifier('exports')
        ),
        x
    );
}

function globalComputedEq(name, x) {
    var literallyThis = es.Literal("this");
    var indirectEval = es.LogicalExpression("||",
        es.Literal(false),
        es.Identifier("eval")
    );
    var global = es.CallExpression(indirectEval, [literallyThis]);
    return es.ExpressionStatement(
        es.AssignmentExpression('=',
            es.MemberExpression(true,
                global,
                es.Literal(name)
            ),
            x
        )
    );
}

function throwHelper(esNode) {
    var throw_ = es.ThrowStatement(esNode);
    var body = [throw_];
    var fn = es.FunctionExpression(null, [], es.BlockStatement(body));
    return es.CallExpression(fn, []);
}

function cleanIdentifier(s) {
    if (/^if|else|while|do$/.test(s)) {
        return '$' + s;
    }
    return s
        .replace(/\+/g, '$plus')
        .replace(/-/g, '$minus')
        .replace(/\*/g, '$star')
        .replace(/\//g, '$slash')
        .replace(/!/g, '$bang')
        .replace(/;/g, '$semicolon')
        .replace(/@/g, '$at')
        .replace(/\?/g, '$question')
        .replace(/\~/g, '$tilde')
        .replace(/\&/g, '$ampersand')
        .replace(/\|/g, '$pipe')
        .replace(/</g, '$lt')
        .replace(/>/g, '$gt')
        .replace(/=/g, '$eq');
}

var handlers = {
    Module: function(node) {
        var value = transformAst(node.expr);
        var expr = moduleExportsEq(value);
        var body = PREDEF.body.concat([expr]);
        return fileWrapper(body);
    },
    Script: function(node) {
        var value = transformAst(node.expr);
        var body = PREDEF.body.concat([value]);
        return fileWrapper(body);
    },
    GetMethod: function(node) {
        var obj = node.obj;
        var prop = node.prop;
        return transformAst(
            ast.Call(
                ast.Identifier('sqgl$$methodGet'),
                [prop, obj]
            )
        );
    },
    CallMethod: function(node) {
        var obj = node.obj;
        var prop = coerceIdentToString(node.prop);
        var args = ast.List(node.args);
        return transformAst(
            ast.Call(
                ast.Identifier('sqgl$$methodCall'),
                [prop, obj, args]
            )
        );
    },
    ReplBinding: function(node) {
        var name = node.binding.identifier.data;
        var expr = transformAst(node.binding.value);
        return fileWrapper([globalComputedEq(name, expr)]);
    },
    ReplExpression: function(node) {
        return fileWrapper([transformAst(node.expression)]);
    },
    Block: function(node) {
        var exprs = node
            .expressions
            .map(transformAst);
        var statements = mapLastSpecial(
            es.ExpressionStatement,
            es.ReturnStatement,
            exprs
        );
        var fn = es.FunctionExpression(null, [], es.BlockStatement(statements));
        return es.CallExpression(fn, []);
    },
    GetProperty: function(node) {
        var obj = node.obj;
        var prop = coerceIdentToString(node.prop);
        return transformAst(
            ast.Call(
                ast.Identifier('sqgl$$get'),
                [prop, obj]
            )
        );
    },
    BinOp: function(node) {
        var d = node.operator.data;
        if (d === 'and' || d === 'or') {
            var op = {and: '&&', or: '||'}[d];
            return es.LogicalExpression(op,
                assertBoolean(node.left),
                assertBoolean(node.right)
            );
        } else {
            var f = ast.Identifier(node.operator.data);
            var args = [node.left, node.right];
            return transformAst(ast.Call(f, args));
        }
    },
    Identifier: function(node) {
        return es.Identifier(cleanIdentifier(node.data));
    },
    IdentifierExpression: function(node) {
        return transformAst(node.data);
    },
    Call: function(node) {
        var f = transformAst(node.f);
        var args = node.args.map(transformAst);
        return es.CallExpression(f, args);
    },
    Parameter: function(node) {
        return transformAst(node.identifier);
    },
    Function: function(node) {
        var params = node
            .parameters
            .map(transformAst);
        var bodyExpr = transformAst(node.body);
        var returnExpr = es.ReturnStatement(bodyExpr);
        var n = node.parameters.length;
        var arityCheck = esprima.parse(
            "if (arguments.length !== " + n + ") { " +
            "throw new sqgl$$Error(" +
                "'expected " + n + " argument(s), " +
                "got ' + arguments.length" +
                "); " +
            "}"
        ).body;
        var body = flatten([
            arityCheck,
            returnExpr
        ]);
        var innerFn = es.FunctionExpression(
            null,
            params,
            es.BlockStatement(body)
        );
        var callee = es.Identifier('sqgl$$freeze');
        var frozen = es.CallExpression(callee, [innerFn]);
        return frozen;
    },
    If: function(node) {
        var p = assertBoolean(node.p);
        var t = transformAst(node.t);
        var f = transformAst(node.f);
        return es.ConditionalExpression(p, t, f);
    },
    Binding: function(node) {
        var identifier = transformAst(node.identifier);
        var value = transformAst(node.value);
        return es.VariableDeclaration('var', [
            es.VariableDeclarator(identifier, value)
        ]);
    },
    Let: function(node) {
        var declarations = node.bindings.map(transformAst);
        var e = transformAst(node.expr);
        var returnExpr = es.ReturnStatement(e);
        var body = declarations.concat([returnExpr]);
        return es.CallExpression(
            es.FunctionExpression(
                null,
                [],
                es.BlockStatement(body)
            ),
            []
        );
    },
    Try: function(node) {
        var expr = transformAst(node.expr);
        var ok = freeze(es.ArrayExpression([
            es.Literal("ok"),
            expr,
        ]));
        var fail =  freeze(es.ArrayExpression([
            es.Literal("fail"),
            es.Identifier("$error")
        ]));
        var catch_ = es.CatchClause(
            es.Identifier("$error"),
            es.BlockStatement([
                es.ReturnStatement(fail)
            ])
        );
        var block = es.BlockStatement([
            es.ReturnStatement(ok)
        ]);
        var internalError = esprima.parse(
            "throw new sqgl$$Error('squiggle: internal error');"
        ).body;
        var try_ = es.TryStatement(block, catch_);
        var body = [try_].concat(internalError);
        var fn = es.FunctionExpression(null, [], es.BlockStatement(body));
        return es.CallExpression(fn, []);
    },
    Error: function(node) {
        var message = transformAst(node.message);
        var exception = es.NewExpression(
            es.Identifier("sqgl$$Error"),
            [message]
        );
        return throwHelper(exception);
    },
    Throw: function(node) {
        var exception = transformAst(node.exception);
        return throwHelper(exception);
    },
    List: function(node) {
        var pairs = node.data.map(transformAst);
        var array = es.ArrayExpression(pairs);
        var callee = es.Identifier('sqgl$$freeze');
        return es.CallExpression(callee, [array]);
    },
    Pair: function(node) {
        return es.ArrayExpression([
            transformAst(node.key),
            transformAst(node.value)
        ]);
    },
    Map: function(node) {
        var pairs = node.data.map(transformAst);
        return es.CallExpression(
            es.Identifier('sqgl$$object'),
            [es.ArrayExpression(pairs)]
        );
    },
    Match: function(node) {
        // TODO
        var e = transformAst(node.expression);
        var body = node.clauses.map(transformAst);
        var matchError = esprima.parse(
            "throw new sqgl$$Error('pattern match failure');"
        ).body;
        var block = es.BlockStatement(body.concat(matchError));
        var id = es.Identifier("$match");
        var fn = es.FunctionExpression(null, [id], block);
        return es.CallExpression(fn, [e]);
    },
    MatchClause: function(node) {
        var e = transformAst(node.expression);
        return match(node.pattern, e);
    },
    MatchPatternSimple: function(node) {
        throw new Error("you shouldn't be here");
    },
    MatchPatternArray: function(node) {
        throw new Error("you shouldn't be here");
    },
    MatchPatternObject: function(node) {
        throw new Error("you shouldn't be here");
    },
    MatchPatternObjectPair: function(node) {
        throw new Error("you shouldn't be here");
    },
    True: function(node) {
        return es.Literal(true);
    },
    False: function(node) {
        return es.Literal(false);
    },
    Null: function(node) {
        return es.Literal(null);
    },
    Undefined: function(node) {
        return es.Identifier('undefined');
    },
    Number: literal,
    String: literal,
};

module.exports = transformAst;
