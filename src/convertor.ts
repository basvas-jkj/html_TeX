import * as fs from "node:fs";

import {TREE, NODE, ELEMENT, TEXT} from "./tree";

let file: number;
function write(line: string)
{
    if (line[line.length - 1] == '\n')
    {
        fs.writeSync(file, line.trim().replace(/\s+/g, ' ').trim() + "\n");
    }
    else
    {
        fs.writeSync(file, line.trim().replace(/\s+/g, ' ').trim());
    }
}
function write_line(line = ""): void
{
    write(line + "\n");
}
function read_head(head: NODE): {title: string, author: string, date: string, language: string}
{
    const params = {title: "empty", author: "unknown", date: null as string, language: null as string};
    for (const ch of head.children)
    {
        if (ch instanceof ELEMENT)
        {
            if (ch.name == "title")
            {
                params.title = (ch.children[0] as TEXT).text;
            }
            else if (ch.name == "meta")
            {
                if (ch.attributes["name"] == "author")
                {
                    params.author = ch.attributes["content"];
                }
                else if (ch.attributes["name"] == "date")
                {
                    params.date = ch.attributes["content"];
                }
                else if (ch.attributes["name"] == "language")
                {
                    params.language = ch.attributes["content"];
                }
            }
        }
    }
    return params;
}

const conversion_entries: Record<string, {before: string, after: string}> =
{
    "body": {before: "", after: ""},
    "h1": {before: "\\section*{", after: "}\n"},
    "h2": {before: "\\subsection*{", after: "}\n"},
    "h3": {before: "\\subsubsection*{", after: "}\n"},
    "h4": {before: "\\paragraph{", after: "}\n"},
    "h5": {before: "\\subparagraph{", after: "}\n"},
    "p": {before: "\n", after: "\n"},

    "b": {before: "\\textbf{", after: "}\n"},
    "strong": {before: "\\textbf{", after: "}\n"},
    "i": {before: "\\textit{", after: "}\n"},
    "em": {before: "\\emph{", after: "}\n"},
    "u": {before: "\\underline{", after: "}\n"},
    "big": {before: "{\\Large\n", after: "}\n"},
    "small": {before: "{\\small\n", after: "}\n"},
    "code": {before: "\\texttt{", after: "}\n"},
    "tt": {before: "\\texttt{", after: "}\n"},
    "a": {before: "\\href{", after: "}\n"},

    "ul": {before: "\\begin{itemize}\n", after: "\\end{itemize}\n"},
    "ol": {before: "\\begin{enumerate}\n", after: "\\end{enumerate}\n"},
    "li": {before: "\\item\n", after: "\n"},

    "dl": {before: "\\begin{description}\n", after: "\\end{description}\n"},
    "dt": {before: "\\item[", after: "]\n"},
    "dd": {before: "", after: "\n"},

    "br": {before: "\\\\", after: ""},
    "hr": {before: "\\noindent\\hrule", after: "\n"}
}

function convert(node: NODE)
{
    if (node instanceof TEXT)
    {
        write(node.text);
    }
    else if (node instanceof ELEMENT)
    {
        if (node.name == "img")
        {
            const attributes = node.attributes;
            if (attributes["src"] != null)
            {
                let options = "";
                if (attributes["height"] != null)
                {
                    options += ",height=" + attributes["height"]
                }
                if (attributes["width"] != null)
                {
                    options += ",width=" + attributes["width"]
                }
                if (options != "")
                {
                    options = "[" + options.substring(1) + "]"
                    write(`\\includegraphics${options}{${attributes["src"]}}`);
                }
                else
                {
                    write(`\\includegraphics{${attributes["src"]}}`);
                }
            }
        }
        else
        {
            write(conversion_entries[node.name].before);
            
            if (node.name == "a" && node.attributes["href"] != null)
            {
                write(node.attributes["href"] + "}{");
            }

            for (const ch of node.children)
            {
                convert(ch);
            }
            write(conversion_entries[node.name].after);
        }
    }
    else
    {
        write_line("% " + node.content);
    }
}

export function convert_to_LaTeX(t: TREE, output: string | 1): void
{
    const html = t.root.children[0];
    let head: ELEMENT;
    let body: ELEMENT;

    for (const ch of html.children)
    {
        if (ch.content == "head")
        {
            head = ch as ELEMENT;
        }
        else if (ch.content == "body")
        {
            body = ch as ELEMENT;
        }
    }

    const params = read_head(head);

    if (output == 1)
    {
        file = 1;
    }
    else
    {
        file = fs.openSync(output, "w");
    }

    write_line("\\documentclass{article}");
    write_line("\\usepackage{graphicx}");
    write_line("\\usepackage{hyperref}");
    if (params.language != null)
    {
        write_line(`\\usepackage[${params.language}]{babel}`);
    }

    write_line(`\\title{${params.title}}`);
    write_line(`\\author{${params.author}}`);
    if (params.date != null)
    {
        write_line(`\\date{${params.date}}`);
    }

    write_line("\\begin{document}");
    write_line("\\maketitle");
    write_line();
    
    convert(body);

    write_line("\\end{document}");

    fs.closeSync(file);
}