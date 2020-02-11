import yargs from 'yargs';
import fs, { stat } from 'fs';
import { Context, runInThisContext } from 'vm';
import { get } from 'https';

const argv = yargs
	.usage('Usage: $0 <filepath>')
	.demandCommand(1, 'Require filepath')
	.argv;


// valid tokens delimiters
// [' ', '(', '{']

const tokenParser = /((['"])(?:(?!\2)[^\\\n\r]|\\(?:\r\n|[\s\S]))*(\2)?|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)|\$\{(?:[^{}]|\{[^}]*\}?)*\}?)*(`)?)|(\/\/.*)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)|(\/(?!\*)(?:\[(?:(?![\]\\]).|\\.)*\]|(?![\/\]\\]).|\\.)+\/(?:(?!\s*(?:\b|[\u0080-\uFFFF$\\'"~({]|[+\-!](?!=)|\.?\d))|[gmiyus]{1,6}\b(?![\u0080-\uFFFF$\\]|\s*(?:[+\-*%&|^<>!=?({]|\/(?![\/*])))))|(0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)|((?!\d)(?:(?!\s)[$\w\u0080-\uFFFF]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+)|(--|\+\+|&&|\|\||=>|\.{3}|(?:[+\-\/%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2})=?|[?~.,:;[\](){}])|(\s+)|(^$|[\s\S])/g;

const DECLARE = "exists";
const PRINT = "show";
const CONDITION = "chance";
const ELSEIF = "another chance"
const ELSE = "nope";

class Parser {


	content: string;
	command: string;
	tokens: string[];
	token: string;
	tokenIndex: number
	expressionState: any
	vars: Map<string, any>;

	constructor(content: string) {
		this.content = content.replace(/ +/g, ' ').replace(/\r\n/g, '\n');
		this.command = "";
		this.tokens = [];
		this.token = "";
		this.tokenIndex = 0;
		this.expressionState = {};
		this.vars = new Map();
	}

	private isString(val: string) {
		let first = val.charAt(0);
		let last = val.charAt(val.length - 1);
		return ((first == '\'' || first == '"' || first == '`') && (last == '\'' || last == '"' || last == '`'));
	}

	private getEndIndex(content: string, delimiters: string[] | string, getEndOfFile: boolean = false): number {
		if (!Array.isArray(delimiters)) {
			delimiters = [delimiters];
		}
		let minEndIndex = -1;
		for (let delimiter of delimiters) {
			let endIndex = content.indexOf(delimiter);
			if (endIndex > -1 && (minEndIndex == -1 || endIndex < minEndIndex)) {
				minEndIndex = endIndex;
			}
		}
		if (getEndOfFile && minEndIndex == -1 && content.length > 0) minEndIndex = content.length;
		return minEndIndex;
	}

	private isValidVarName(varName: string) {
		return /[a-zA-Z_$][0-9a-zA-Z_$]*/.test(varName);
	}

	peekToken(distance: number) {
		return this.tokens[this.tokenIndex + distance - 1];
	}

	nextToken() {
		if (this.tokenIndex >= this.tokens.length) throw "No more tokens";
		this.token = this.tokens[this.tokenIndex++];
	}

	prevToken() {
		if (this.tokenIndex == 0) throw "Cant go back"
		this.token = this.tokens[--this.tokenIndex];
	}

	aggregateTokens(howMany: number): string { // returns this token + howmany tokens concateneated
		let token = this.token;
		for (let i = 1; i <= howMany; i++) {
			token += " " + this.tokens[this.tokenIndex + i]
		}
		return token;
	}

	nextCommand() {
		let endIndex;
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
	}

	makeTokens() {
		this.tokens = (this.command.match(tokenParser) as string[]).filter(val => { return val != " " && val != "\t" });
		this.tokenIndex = 0;
		this.token = "";
	}

	private expectAndGetNextToken() {
		// expect something, like a '{' afeter a 'for(<something>)'
	}

	private resolveValue(): any {
		let value;
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
				if (isNaN(value)) throw this.token;
			}
			else
				value = this.token;
		}
		return value;
	}

	resolveExpression(): any {
		this.expressionState = {};
		return this.recurExpression();
	}

	private recurExpression(): any {
		let newValue = this.expressionState.value;
		let leftValue = this.expressionState.value;
		let minusNext = this.expressionState.minusNext;
		delete this.expressionState.minusNext;

		if (!this.expressionState.value) {

			try {
				this.nextToken();
			}
			catch (error) {
				let value = newValue || leftValue;
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
					if (isNaN(leftValue)) throw this.token;
				}
				else
					leftValue = this.token;
			}
			leftValue = minusNext ? -leftValue : leftValue
		}
		delete this.expressionState.value;

		if (this.peekToken(1) == ")") {
			this.nextToken();
			let value = newValue || leftValue;
			this.expressionState.resolve = true;
			return value;
		}

		try {
			this.nextToken();
		}
		catch (error) {
			let value = newValue || leftValue;
			return value;
		}

		let op = this.token;

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
			return newValue
		}
		return this.recurExpression();
	}

	compareExpressions(leftExpression: any, rightExpression: any, op: string) {
		let result: any;
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
	}

	parseCommand(state: any = {}) {
		if (this.command == "") return;
		this.makeTokens();
		try {
			this.nextToken();
			let expression = this.token;
			if (expression == CONDITION) {
				expression = this.resolveExpression();
				console.log(expression);
				let rightExpression;
				let op = this.token;
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
					let varName = this.token;
					if (this.isValidVarName(varName)) {
						let value;
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
					let value = this.resolveExpression();
					console.log(value); //handle undefined
				}
				catch (error) {
					console.log(`Undefined variable "${error}"`);
				}
			}
			else if (false) {

			}
			else { // ultimo else
				if (this.vars.has(expression)) {
					let varName = expression;
					this.nextToken();
					if (this.token == "=") {
						let newValue = this.resolveExpression();
						this.vars.set(varName, newValue);

					}
				}
			}


		}
		catch{
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
	}

}

let content: string;

try {
	content = fs.readFileSync(argv._[0], 'utf8');
}
catch (error) {
	throw error;
}

let file = new Parser(content);

while (file.content.length > 0) {
	file.nextCommand();
	file.parseCommand();
}
// console.log(file.vars);