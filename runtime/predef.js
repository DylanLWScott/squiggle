// TODO: Add arity checking.
// TODO: Add type checking.

// MDN polyfill for Object.js.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
var is = Object.is || function(x, y) {
    // SameValue algorithm
    if (x === y) { // Steps 1-5, 7-10
        // Steps 6.b-6.e: +0 != -0
        return x !== 0 || 1 / x === 1 / y;
    } else {
        // Step 6.a: NaN == NaN
        return x !== x && y !== y;
    }
};

var undefined = void 0;
var global = (1, eval)("this");
var isObject = function(x) {
    return x && typeof x === "object";
};
var slice = function(i, xs) {
    return [].slice.call(xs, i);
};
var $lt = function(a, b) {
    var ta = typeof a;
    var tb = typeof b;
    if (ta === tb && (ta === 'string' || ta === 'number')) {
        return a < b;
    }
    throw new sqgl$$Error('incorrect argument types for <')
};
var $gt = function(a, b) {
    var ta = typeof a;
    var tb = typeof b;
    if (ta === tb && (ta === 'string' || ta === 'number')) {
        return a > b;
    }
    throw new sqgl$$Error('incorrect argument types for >')
};
var $lt$eq = function(a, b) {
    return $lt(a, b) || $eq$eq(a, b);
};
var $gt$eq = function(a, b) {
    return $gt(a, b) || $eq$eq(a, b);
};
var $bang$eq = function(a, b) {
    return !$eq(a, b);
};
var $pipe$gt = function(x, f) {
    if (typeof f !== 'function') {
        throw new sqgl$$Error('right-side not a function in |>, ' + f);
    }
    return f(x);
};
var $eq$eq = function recur(a, b) {
    if (typeof a !== typeof b) {
        return false;
    }
    if (a === b) {
        return true;
    }
    // TODO: `NaN`s should not be equal under `=`, only `is`.
    if (a !== a && b !== b) {
        return true;
    }
    // TODO: Only check arrays based on their numeric keys.
    if (sqgl$$isObject(a) && sqgl$$isObject(b)) {
        // TODO: Remove duplicates.
        var ks = sqgl$$keys(a).concat(sqgl$$keys(b)).sort();
        return ks.every(function(k) {
            return (
                k in a &&
                k in b &&
                recur(a[k], b[k])
            );
        });
    }
    return false;
};
var $plus = function(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
        return a + b;
    }
    throw new sqgl$$Error('incorrect argument types for +');
};
var $plus$plus = function(a, b) {
    if (typeof a === 'string' && typeof b === 'string') {
        return a + b;
    }
    if (sqgl$$isArray(a) && sqgl$$isArray(b)) {
        return a.concat(b);
    }
    throw new sqgl$$Error('incorrect argument types for ++');
};
var $minus = function(a, b) {
    assertNumeric(a);
    assertNumeric(b);
    return a - b;
};
var $star = function(a, b) {
    assertNumeric(a);
    assertNumeric(b);
    return a * b;
};
var $slash = function(a, b) {
    assertNumeric(a);
    assertNumeric(b);
    return a / b;
};
var $not = function(x) {
    return !assertBoolean(x);
};
var $negate = function(x) {
    return -assertNumeric(x);
};
var freezeAfter = function(x, f) {
    f(x);
    return sqgl$$freeze(x);
};
var map = function(f, xs) {
    return xs.map(function(x) {
        return f(x);
    });
};
var join = function(separator, items) {
    return [].join.call(items, separator);
};
var foldLeft = function(f, z, xs) {
    xs.forEach(function(x) {
        z = f(z, x);
    });
    return z;
};
var fold = foldLeft;
var isEmpty = function(xs) {
    return xs.length === 0;
};
var filter = function(xs, f) {
    var ys = [];
    for (var i = 0, n = xs.length; i < n; i++) {
        if (f(xs[i])) {
            ys.push(xs[i]);
        }
    }
    return sqgl$$freeze(ys);
};
var head = function(xs) {
    if (!isEmpty(xs)) {
        return xs[0];
    }
    throw new sqgl$$Error('cannot get head of empty list');
};
var tail = function(xs) {
    return [].slice.call(xs, 1);
};
var reduce = function(f, xs) {
    return foldLeft(f, head(xs), tail(xs));
};
var foldRight = function(f, z, xs) {
    return foldLeft(flip(f), z, reverse(xs));
};
var reverse = function(xs) {
    return toArray(xs).reverse();
};
var toArray = function(xs) {
    return [].slice.call(xs);
};
var flip = function(f) {
    return function(x, y) {
        return f(y, x);
    };
};
var toString = function(x) {
    if (x) {
        if ('toString' in x) {
            return x.toString();
        } else {
            return '{WEIRD_OBJECT}';
        }
    } else {
        return '' + x;
    }
};
var denew = function(Class) {
    return function WrappedConstructor() {
        var args = toArray(arguments);
        var f = Class.bind.apply(Class, [Class].concat(args));
        return new f;
    };
};
var get = function(k, obj) {
    if (obj === null || obj === undefined) {
        throw new sqgl$$Error('cannot get ' + k + ' of ' + obj);
    }
    if (k in Object(obj)) {
        return obj[k];
    }
    throw new sqgl$$Error('key ' + k + ' not in ' + toString(obj));
};
var set = function(k, v, obj) {
    if (obj === null || typeof obj !== 'object') {
        throw new sqgl$$Error('cannot set ' + k + ' on ' + toString(obj));
    }
    if (sqgl$$isFrozen(obj)) {
        throw new sqgl$$Error('cannot set ' + k + ' on frozen object');
    }
    obj[k] = v;
    return obj;
};
var methodGet = function(method, obj) {
    return obj[method].bind(obj);
};
var methodCall = function(method, obj, args) {
    return obj[method].apply(obj, args);
};
var update = function(a, b) {
    var c = sqgl$$create(sqgl$$getPrototypeOf(a));
    sqgl$$keys(a).forEach(function(k) { c[k] = a[k]; });
    sqgl$$keys(b).forEach(function(k) { c[k] = b[k]; });
    return sqgl$$freeze(c);
};
var $tilde = update;
var sqgl$$object = function(data) {
    if (!sqgl$$isArray(data)) {
        throw new sqgl$$Error(
            'objects can only be constructed from an array'
        );
    }
    var obj = {};
    var i = 0;
    var n = data.length;
    while (i < n) {
        if (typeof data[i][0] !== "string") {
            throw new sqgl$$Error(
                "object keys must be strings: " + data[i]
            );
        }
        obj[data[i][0]] = data[i][1];
        i++;
    }
    return sqgl$$freeze(obj);
};
var sqgl$$isObject = function(x) {
    if (arguments.length !== 1) {
        throw new sqgl$$Error(
            'wrong number of arguments to sqgl$$isObject'
        );
    }
    return x !== null && typeof x === 'object';
};
var sqgl$$assertBoolean = function(x) {
    if (typeof x !== 'boolean') {
        throw new sqgl$$Error('not a boolean: ' + toString(x));
    }
    return x;
};
var sqgl$$assertNumeric = function(x) {
    if (typeof x !== 'number') {
        throw new sqgl$$Error('not a number: ' + toString(x));
    }
    return x;
};
var assertBoolean = sqgl$$assertBoolean;
var assertNumeric = sqgl$$assertNumeric;
var sqgl$$slice = slice;
var sqgl$$update = update;
var sqgl$$isObject = isObject;
var sqgl$$Object = Object;
var sqgl$$isFrozen = Object.isFrozen;
var sqgl$$freeze = Object.freeze;
var sqgl$$create = Object.create;
var sqgl$$is = is;
var sqgl$$isArray = Array.isArray;
var sqgl$$keys = Object.keys;
var sqgl$$get = get;
var sqgl$$methodGet = methodGet;
var sqgl$$methodCall = methodCall;
var sqgl$$getPrototypeOf = Object.getPrototypeOf;
var sqgl$$Error = Error;
var sqgl$$global = global;
