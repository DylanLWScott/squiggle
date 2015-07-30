var isObject = require("lodash/lang/isObject");
var flatten = require("lodash/array/flatten");
var fs = require("fs");
var path = require("path");
var jsbeautify = require("js-beautify");
var esprima = require("esprima");
var es = require("./es");
var ast = require("./ast");

function transformAst(node) {
    if (!isObject(node)) {
        throw new Error("Not a node: " + jsonify(node));
    }
    if (handlers.hasOwnProperty(node.type)) {
        return handlers[node.type](node);
    }
    throw new Error("Unknown AST node: " + jsonify(node));
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
    return es.ExpressionStatement(
        es.AssignmentExpression('=',
            es.MemberExpression(false,
                es.Identifier('module'),
                es.Identifier('exports')
            ),
            x
        )
    );
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

function fileWrapper(body) {
    var useStrict = es.ExpressionStatement(es.Literal('use strict'));
    var newBody = [useStrict].concat(body);
    var fn = es.FunctionExpression(null, [], es.BlockStatement(newBody));
    return es.Program([es.CallExpression(fn, [])]);
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
        var prop = ast.String(node.prop.data);
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
        } else if (d === ';') {
            return es.SequenceExpression([
                transformAst(node.left),
                transformAst(node.right)
            ]);
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
        var setRet = es.VariableDeclaration('var', [
            es.VariableDeclarator(
                es.Identifier('$ret'),
                bodyExpr
            )
        ]);
        var returnExpr = es.ReturnStatement(es.Identifier('$ret'));
        var n = node.parameters.length;
        var arityCheck = esprima.parse(
            "if (arguments.length !== " + n + ") { " +
            "throw new sqgl$$Error(" +
                "'expected " + n + " argument(s), " +
                "got ' + arguments.length" +
                "); " +
            "}"
        ).body;
        var preCheck = esprima.parse(
            "if ($metadata.pre && !$metadata.pre.apply(null, arguments)) {" +
                "throw new sqgl$$Error(" +
                    "'Failed precondition'" +
                ");" +
            "}"
        ).body;
        var postCheck = esprima.parse(
            "if ($metadata.post && !$metadata.post($ret)) {" +
                "throw new sqgl$$Error(" +
                    "'Failed postcondition'" +
                ");" +
            "}"
        ).body;
        var metadata = es.VariableDeclaration('var', [
            es.VariableDeclarator(
                es.Identifier('$metadata'),
                transformAst(node.metadata)
            )
        ]);
        var body = flatten([
            arityCheck,
            preCheck,
            setRet,
            postCheck,
            returnExpr
        ]);
        var innerFn = es.FunctionExpression(
            null,
            params,
            es.BlockStatement(body)
        );
        var callee = es.Identifier('sqgl$$freeze');
        var frozen = es.CallExpression(callee, [innerFn]);
        var outerFn = es.FunctionExpression(
            null,
            [],
            es.BlockStatement([
                metadata,
                es.ReturnStatement(frozen)
            ])
        );
        return es.CallExpression(outerFn, []);
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
