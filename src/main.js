#!/usr/bin/env node
"use strict";

var pkg = require("../package.json");
var fs = require("fs");
var path = require("path");
var argv = require("yargs")
    .usage("Usage: squiggle --input [file] --output [file]")
    .option("input", {
        alias: "i",
        describe: "Read Squiggle from this file",
        nargs: 1,
        string: true,
        demand: true
    })
    .option("output", {
        alias: "o",
        describe: "Write JavaScript to this file",
        nargs: 1,
        string: true,
        demand: true
    })
    .option("help", {
        alias: "h",
        describe: "Print this message"
    })
    .version(pkg.version)
    .alias("version", "v")
    .epilogue("Version " + pkg.version)
    .showHelpOnFail(true)
    .strict()
    .argv;

var parse = require("./parse");
var transformAst = require("./transform-ast");
var compile = require("./compile");
var lint = require("./lint");

var UTF8 = "utf-8";

function die(message) {
    console.error("squiggle: error: " + message);
    process.exit(1);
}

var txt = fs.readFileSync(argv.input, "utf-8");
var ast = parse(txt);
var warnings = lint(ast);

warnings.forEach(function(m) {
    console.error('squiggle: lint: ' + m);
});

var es = transformAst(ast);
var code = compile(es);

fs.writeFileSync(argv.output, code, UTF8);
