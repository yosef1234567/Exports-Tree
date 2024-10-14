import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as readline from 'readline';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface Arguments {
  path: string;
  depth?: number;
  ignore: string[];
}

const defaultIgnorePatterns = ['node_modules', '.git', '.husky', 'coverage', '.next']

const argv = yargs(hideBin(process.argv))
  .option('path', {
    alias: 'p',
    type: 'string',
    description: 'Path to start from',
    default: '.'
  })
  .option('depth', {
    alias: 'd',
    type: 'number',
    description: 'Maximum depth to traverse',
  })
  .option('ignore', {
    alias: 'i',
    type: 'array',
    description: 'Patterns to ignore',
    default: defaultIgnorePatterns,
    coerce: (input) => {
      return defaultIgnorePatterns.concat(input);
    }
  })
  .help()
  .parse() as Arguments;

function getExports(filePath: string): string[] {
    const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf-8'),
        ts.ScriptTarget.Latest,
        true
    );

    const exports: string[] = [];

    function visit(node: ts.Node) {
        if (ts.isExportDeclaration(node) || 
            (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) ||
            (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) ||
            (ts.isClassDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) ||
            (ts.isInterfaceDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) ||
            (ts.isTypeAliasDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) {
            
            if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
                node.exportClause.elements.forEach(element => {
                    exports.push(element.name.text);
                });
            } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
                exports.push(node.name.text);
            } else if (ts.isVariableStatement(node)) {
                node.declarationList.declarations.forEach(declaration => {
                    if (ts.isIdentifier(declaration.name)) {
                        exports.push(declaration.name.text);
                    }
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return exports;
}

function shouldIgnore(name: string, ignorePatterns: string[]): boolean {
    return ignorePatterns.some(pattern => new RegExp(pattern).test(name));
}

function generateTree(dir: string, prefix: string = '', depth: number = 0): void {
    if (argv.depth !== undefined && depth > argv.depth) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => !shouldIgnore(entry.name, argv.ignore));

    entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const newPrefix = prefix + (isLast ? '└── ' : '├── ');
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            console.log(newPrefix + chalk.blue(entry.name));
            generateTree(fullPath, prefix + (isLast ? '    ' : '│   '), depth + 1);
        } else if (entry.isFile()) {
            console.log(newPrefix + chalk.green(entry.name));
            if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
                const exports = getExports(fullPath);
                if (exports.length > 0) {
                    const exportPrefix = prefix + (isLast ? '    ' : '│   ') + '    ';
                    console.log(exportPrefix + chalk.yellow('Exports:'));
                    exports.forEach((exp, i) => {
                        const isLastExport = i === exports.length - 1;
                        console.log(exportPrefix + chalk.cyan((isLastExport ? '└── ' : '├── ') + exp));
                    });
                }
            }
        }
    });
}

function autocomplete(line: string): string[] {
  const dir = path.dirname(line);
  const base = path.basename(line);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
      .filter(entry => entry.name.startsWith(base))
      .map(entry => path.join(dir, entry.name));
}

async function main() {
  let startPath = process.argv[2] || '.';

    if (!startPath) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            completer: (line: string) => {
                const completions = autocomplete(line);
                return [completions, line];
            }
        });

        startPath = await new Promise<string>((resolve) => {
            rl.question('Enter the path to start from (press Tab for autocomplete): ', (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
    startPath = path.resolve(startPath);

    if (!fs.existsSync(startPath)) {
        console.error(chalk.red(`Error: The path "${startPath}" does not exist.`));
        process.exit(1);
    }

    if (!fs.statSync(startPath).isDirectory()) {
        console.error(chalk.red(`Error: "${startPath}" is not a directory.`));
        process.exit(1);
    }

    console.log(chalk.bold(`Generating tree for: ${startPath}`));
    generateTree(startPath);
}

main();