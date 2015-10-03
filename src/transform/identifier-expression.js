var die = require("../die");
var es = require("../es");

function IdentifierExpression(transform, node) {
    var id = transform(node.data);
    var name = es.Literal(node.data.data);
    var ref = es.Identifier("$ref");
    if (ref === "_") {
        die("squiggle: cannot compile a reference to a variable named _ as that will never be bound");
    }
    return es.CallExpression(ref, [id, name]);
}

module.exports = IdentifierExpression;