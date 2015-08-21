var parser = require("../build/parser");

function parse(options) {
    return function(code) {
        return parser.parse(code);
    };
}

module.exports = parse;
