"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var yargs_1 = __importDefault(require("yargs"));
var fs_1 = __importDefault(require("fs"));
var argv = yargs_1.default
    .usage('Usage: $0 <filepath>')
    .demandCommand(1, 'Require filepath')
    .argv;
// valid tokens delimiters
// [' ', '(', '{']
var tokenParser = /((['"])(?:(?!\2)[^\\\n\r]|\\(?:\r\n|[\s\S]))*(\2)?|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)|\$\{(?:[^{}]|\{[^}]*\}?)*\}?)*(`)?)|(\/\/.*)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)|(\/(?!\*)(?:\[(?:(?![\]\\]).|\\.)*\]|(?![\/\]\\]).|\\.)+\/(?:(?!\s*(?:\b|[\u0080-\uFFFF$\\'"~({]|[+\-!](?!=)|\.?\d))|[gmiyus]{1,6}\b(?![\u0080-\uFFFF$\\]|\s*(?:[+\-*%&|^<>!=?({]|\/(?![\/*])))))|(0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)|((?!\d)(?:(?!\s)[$\w\u0080-\uFFFF]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+)|(--|\+\+|&&|\|\||=>|\.{3}|(?:[+\-\/%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2})=?|[?~.,:;[\](){}])|(\s+)|(^$|[\s\S])/g;
var DECLARE = "exists";
var PRINT = "show";
var CONDITION = "chance";
var ELSEIF = "another chance";
var ELSE = "nope";
var Parser = /** @class */ (function () {
    function Parser(content) {
        this.content = content.replace(/ +/g, ' ').replace(/\r\n/g, '\n');
        this.command = "";
        this.tokens = [];
        this.token = "";
        this.tokenIndex = 0;
        this.expressionState = {};
        this.vars = new Map();
    }
    Parser.prototype.isString = function (val) {
        var first = val.charAt(0);
        var last = val.charAt(val.length - 1);
        return ((first == '\'' || first == '"' || first == '`') && (last == '\'' || last == '"' || last == '`'));
    };
    Parser.prototype.getEndIndex = function (content, delimiters, getEndOfFile) {
        if (getEndOfFile === void 0) { getEndOfFile = false; }
        if (!Array.isArray(delimiters)) {
            delimiters = [delimiters];
        }
        var minEndIndex = -1;
        for (var _i = 0, delimiters_1 = delimiters; _i < delimiters_1.length; _i++) {
            var delimiter = delimiters_1[_i];
            var endIndex = content.indexOf(delimiter);
            if (endIndex > -1 && (minEndIndex == -1 || endIndex < minEndIndex)) {
                minEndIndex = endIndex;
            }
        }
        if (getEndOfFile && minEndIndex == -1 && content.length > 0)
            minEndIndex = content.length;
        return minEndIndex;
    };
    Parser.prototype.isValidVarName = function (varName) {
        return /[a-zA-Z_$][0-9a-zA-Z_$]*/.test(varName);
    };
    Parser.prototype.peekToken = function (distance) {
        return this.tokens[this.tokenIndex + distance - 1];
    };
    Parser.prototype.nextToken = function () {
        if (this.tokenIndex >= this.tokens.length)
            throw "No more tokens";
        this.token = this.tokens[this.tokenIndex++];
    };
    Parser.prototype.prevToken = function () {
        if (this.tokenIndex == 0)
            throw "Cant go back";
        this.token = this.tokens[--this.tokenIndex];
    };
    Parser.prototype.aggregateTokens = function (howMany) {
        var token = this.token;
        for (var i = 1; i <= howMany; i++) {
            token += " " + this.tokens[this.tokenIndex + i];
        }
        return token;
    };
    Parser.prototype.nextCommand = function () {
        var endIndex;
        do {
            endIndex = this.getEndIndex(this.content, [';', '\n'], true);
            if (endIndex == -1) {
                this.content = "";
                this.command = "";
                return;
            }
            this.command = this.content.substring(0, endIndex);
            this.content = this.content.substring(endIndex + 1);
        } while (this.command.trim().startsWith('//'));
    };
    Parser.prototype.makeTokens = function () {
        this.tokens = this.command.match(tokenParser).filter(function (val) { return val != " " && val != "\t"; });
        this.tokenIndex = 0;
        this.token = "";
    };
    Parser.prototype.expectAndGetNextToken = function () {
        // expect something, like a '{' afeter a 'for(<something>)'
    };
    Parser.prototype.resolveValue = function () {
        var value;
        this.nextToken();
        if (this.token == "(") {
            return this.recurExpression();
        }
        if (this.vars.has(this.token)) {
            value = this.vars.get(this.token);
        }
        else {
            if (!this.isString(this.token)) {
                value = parseFloat(this.token);
                if (isNaN(value))
                    throw this.token;
            }
            else
                value = this.token;
        }
        return value;
    };
    Parser.prototype.resolveExpression = function () {
        this.expressionState = {};
        return this.recurExpression();
    };
    Parser.prototype.recurExpression = function () {
        var newValue = this.expressionState.value;
        var leftValue = this.expressionState.value;
        var minusNext = this.expressionState.minusNext;
        delete this.expressionState.minusNext;
        if (!this.expressionState.value) {
            try {
                this.nextToken();
            }
            catch (error) {
                var value = newValue || leftValue;
                return minusNext ? -value : value;
            }
            if (this.token == "(") {
                //this.nextToken();
                leftValue = this.recurExpression();
            }
            else if (this.vars.has(this.token)) {
                leftValue = this.vars.get(this.token);
            }
            else {
                if (!this.isString(this.token)) {
                    leftValue = parseFloat(this.token);
                    if (isNaN(leftValue))
                        throw this.token;
                }
                else
                    leftValue = this.token;
            }
            leftValue = minusNext ? -leftValue : leftValue;
        }
        delete this.expressionState.value;
        if (this.peekToken(1) == ")") {
            this.nextToken();
            var value = newValue || leftValue;
            this.expressionState.resolve = true;
            return value;
        }
        try {
            this.nextToken();
        }
        catch (error) {
            var value = newValue || leftValue;
            return value;
        }
        var op = this.token;
        if (op == "+") {
            newValue = leftValue + this.recurExpression();
        }
        else if (op == "-") {
            this.expressionState.minusNext = true;
            newValue = leftValue + this.recurExpression();
        }
        else if (op == "*") {
            newValue = leftValue * this.resolveValue();
        }
        else if (op == "/") {
            newValue = leftValue / this.resolveValue();
        }
        else if (op == ">" || op == ">=" || op == "==" || op == "<" || op == "<=" || op == "==" || op == "!=") {
            this.expressionState.finish = true;
            return leftValue;
        }
        this.expressionState.value = newValue;
        if (this.expressionState.resolve || this.expressionState.finish) {
            delete this.expressionState.resolve;
            return newValue;
        }
        return this.recurExpression();
    };
    Parser.prototype.compareExpressions = function (leftExpression, rightExpression, op) {
        var result;
        if (op == ">") {
            result = leftExpression > rightExpression;
        }
        else if (op == ">=") {
            result = leftExpression >= rightExpression;
        }
        else if (op == "==") {
            result = leftExpression == rightExpression;
        }
        else if (op == "<") {
            result = leftExpression < rightExpression;
        }
        else if (op == "<=") {
            result = leftExpression <= rightExpression;
        }
        else if (op == "==") {
            result = leftExpression == rightExpression;
        }
        else if (op == "!=") {
            result = leftExpression != rightExpression;
        }
        return result;
    };
    Parser.prototype.parseCommand = function (state) {
        if (state === void 0) { state = {}; }
        if (this.command == "")
            return;
        this.makeTokens();
        try {
            this.nextToken();
            var expression = this.token;
            if (expression == CONDITION) {
                expression = this.resolveExpression();
                console.log(expression);
                var rightExpression = void 0;
                var op = this.token;
                if (op == ">" || op == ">=" || op == "==" || op == "<" || op == "<=" || op == "==" || op == "!=") {
                    //this.nextToken();
                    rightExpression = this.resolveExpression();
                    console.log(rightExpression);
                    expression = this.compareExpressions(expression, rightExpression, op);
                }
                this.nextCommand();
                if (expression) {
                    // run next line
                    this.parseCommand({ ifStatement: true });
                }
                else {
                    // dont run
                    this.makeTokens();
                    this.nextToken();
                    if (this.token == ELSE) {
                        this.nextCommand();
                        this.parseCommand();
                    }
                }
            }
            else if (expression == DECLARE) { // DECLARE VAR
                do {
                    this.nextToken(); // VARNAME
                    var varName = this.token;
                    if (this.isValidVarName(varName)) {
                        var value = void 0;
                        try {
                            this.nextToken();
                            if (this.token) {
                                if (this.token == "=") {
                                    this.nextToken();
                                    value = this.token;
                                }
                                else {
                                    // TODO
                                    // ERROR
                                }
                            }
                            if (!this.isString(this.token))
                                value = parseFloat(this.token);
                            else
                                value = this.token;
                        }
                        finally {
                            this.vars.set(varName, value);
                        }
                    }
                    this.nextToken();
                } while (this.token == ',');
            }
            else if (expression == PRINT) {
                try {
                    var value = this.resolveExpression();
                    console.log(value); //handle undefined
                }
                catch (error) {
                    console.log("Undefined variable \"" + error + "\"");
                }
            }
            else if (false) {
            }
            else { // ultimo else
                if (this.vars.has(expression)) {
                    var varName = expression;
                    this.nextToken();
                    if (this.token == "=") {
                        var newValue = this.resolveExpression();
                        this.vars.set(varName, newValue);
                    }
                }
            }
        }
        catch (_a) {
            // TODO error
        }
        finally {
            if (state.ifStatement) {
                this.nextCommand();
                this.makeTokens();
                this.nextToken();
                if (this.token == ELSE) {
                    this.nextCommand();
                }
            }
        }
    };
    return Parser;
}());
var content;
try {
    content = fs_1.default.readFileSync(argv._[0], 'utf8');
}
catch (error) {
    throw error;
}
var file = new Parser(content);
while (file.content.length > 0) {
    file.nextCommand();
    file.parseCommand();
}
// console.log(file.vars);
//# sourceMappingURL=index.js.map