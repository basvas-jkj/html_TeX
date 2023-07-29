import * as CHAR from "./char";

import {STATE, switch_state} from "./tokeniser";
import {TOKEN, TOKEN_TYPE} from "./token";
import {convert_to_LaTeX} from "./convertor"

function is_white_char(ch: string): boolean
{
    return ch == '\r' || CHAR.is_white_char(ch);
}

enum MODE
{
    initial, before_html, before_head, in_head, after_head,
    in_body, after_body, after_after_body,
    text
}

const headings = ["h1", "h2", "h3", "h4", "h5"]; // LaTeX article supports only five layers of headings
const formatting = ["b", "strong", "i", "em", "u", "big", "small", "code", "tt"];
const unsupported_tags = ["frameset", "noframes", "style", "script", "template", "base",
    "basefont", "bgsound", "link"]

export class NODE
{
    public static from_comment(token: TOKEN): NODE
    {
        return new NODE(token.content);
    }

    protected _children: NODE[];
    protected _content: string;
    
    public get children(): NODE[]
    {
        return this._children;
    }
    public get content(): string
    {
        return this._content;
    }

    public constructor(content: string = null)
    {
        this._children = [];
        this._content = content;
    }

    public add_child(child: NODE)
    {
        this._children.push(child);
    }

    public log(prefix = "")
    {
        console.log(prefix + this._content);
        for (const child of this._children)
        {
            child.log(prefix + "_");
        }
    }
}
export class ELEMENT extends NODE
{
    get name(): string
    {
        return this._content;
    }

    public attributes: Record<string, string>;
    public static from_token(token: TOKEN): ELEMENT
    {
        const n = new ELEMENT(token.content);

        if (token.type == TOKEN_TYPE.start_tag)
        {
            n.attributes = token.attributes;
        }
        return n;
    }

    public insert_char(ch: string): void
    {
        if (this._children.length > 0 && this._children[this._children.length-1] instanceof TEXT)
        {
            (this._children[this._children.length-1] as TEXT).add_text(ch);
        }
        else
        {
            this.add_child(new TEXT(ch));
        }
    }
    public is(...elements: string[]): boolean
    {
        return elements.includes(this.name);
    }
}
export class TEXT extends NODE
{
    private _text: string;
    public get text(): string
    {
        return this._text;
    }

    public add_text(text: string)
    {
        this._text += text;
    }
    public constructor(text: string)
    {
        super();
        this._content = "text";
        this._text = text;
    }

    public override log(prefix = "")
    {
        console.log(prefix + " text" + '("' + this._text + '")');
    }
}

export class TREE
{
    private insertion_mode: MODE;
    private _root: NODE;
    private quirk_mode = false;
    private stack_of_open_elements: ELEMENT[];
    private readonly mode_handlers: Record<MODE, (t: TOKEN)=>boolean>;
    private head: ELEMENT = null;
    private original_mode: MODE;
    private _ready: boolean;

    public get root(): NODE
    {
        return this._root;
    }
    public get ready(): boolean
    {
        return this._ready;
    }

    private emit: (message: string)=> void;
    private parse_error()
    {
        this.emit(`parse error (${this.insertion_mode})`);
    }
    private stop_parsing()
    {
        this._ready = true;
        convert_to_LaTeX(this);
    }

    public constructor(emit: (message: string)=> void)
    {
        this.emit = emit;
        this.insertion_mode = MODE.initial;
        this._root = new NODE();
        this.stack_of_open_elements = [];
        this._ready = false;

        this.mode_handlers =
        {
            [MODE.initial]: this.initial_mode.bind(this),
            [MODE.before_html]: this.before_html_mode.bind(this),
            [MODE.before_head]: this.before_head_mode.bind(this),
            [MODE.in_head]: this.in_head_mode.bind(this),
            [MODE.after_head]: this.after_head_mode.bind(this),
            [MODE.in_body]: this.in_body_mode.bind(this),
            [MODE.after_body]: this.after_body_mode.bind(this),
            [MODE.after_after_body]: this.after_after_body_mode.bind(this),
            [MODE.text]: this.text_mode.bind(this)
        }
    }

    private get last(): ELEMENT
    {
        return this.stack_of_open_elements[this.stack_of_open_elements.length - 1];
    }

    private has_an_element_in_scope(target: string, scope: string[] = []): boolean
    {
        scope.push("html");
        for (let f = this.stack_of_open_elements.length - 1; f >= 0; f -= 1)
        {
            if (this.stack_of_open_elements[f].name == target)
            {
                return true;
            }
            else if (scope.includes(this.stack_of_open_elements[f].name))
            {
                return false;
            }
        }
        return false;
    }
    private close(element_name: string)
    {
        if (this.last.name != element_name)
        {
            this.parse_error();
        }
        while (this.last.name != element_name)
        {
            this.stack_of_open_elements.pop();
        }
        this.stack_of_open_elements.pop();
    }
    private insert_element(t: TOKEN | string): ELEMENT
    {
        const element = (typeof(t) == "string") ? new ELEMENT(t) : ELEMENT.from_token(t);
        this.last.add_child(element);
        this.stack_of_open_elements.push(element);
        return element;
    }
    private generic_rcdata(t: TOKEN): void
    {
        this.insert_element(t);
        switch_state(STATE.rcdata, t.content);
        this.original_mode = this.insertion_mode;
        this.insertion_mode = MODE.text;
    }

    private initial_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.comment)
        {
            this._root.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            throw new Error("Under construction.");
        }
        else if (t.type != TOKEN_TYPE.character || !is_white_char(t.content))
        {
            this.parse_error();
            this.quirk_mode = true;
            this.insertion_mode = MODE.before_html;
            return true;
        }
        return false;
    }
    private before_html_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this._root.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "html")
        {
            const html = ELEMENT.from_token(t);
            this._root.add_child(html);
            this.stack_of_open_elements.push(html);
            this.insertion_mode = MODE.before_head;
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["head", "body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else if (!(t.type == TOKEN_TYPE.character && is_white_char(t.content)))
        {
            const html = new ELEMENT("html");
            this._root.add_child(html);
            this.stack_of_open_elements.push(html);
            this.insertion_mode = MODE.before_head;
            return true;
        }
        return false;
    }
    private before_head_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.comment)
        {
            this._root.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "html")
        {
            return this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "head")
        {
            this.head = this.insert_element(t);
            this.insertion_mode = MODE.in_head;
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["head", "body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else if (!(t.type == TOKEN_TYPE.character && is_white_char(t.content)))
        {
            this.head = this.insert_element("head");
            this.insertion_mode = MODE.in_head;
            return true;
        }
        return false;
    }
    private in_head_mode(t: TOKEN): boolean
    {
        if (t.is(...unsupported_tags))
        {
            throw new Error(`HTML tag ${t.content} is not supported.`);
        }
        else if (t.type == TOKEN_TYPE.character && is_white_char(t.content))
        {
            this.head.insert_char(t.content);
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.head.insert_char(t.content);
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag)
        {
            if (t.is("html"))
            {
                return this.in_body_mode(t);
            }
            else if (t.is("meta"))
            {
                this.insert_element(t);
                this.stack_of_open_elements.pop();
            }
            else if (t.is("title"))
            {
                this.generic_rcdata(t);
            }
            else if (t.is("head"))
            {
                this.parse_error();
            }
            else
            {
                this.stack_of_open_elements.pop();
                this.insertion_mode = MODE.after_head;
                return true;
            }
        }
        else if (t.type == TOKEN_TYPE.end_tag)
        {
            if (t.content == "head")
            {
                this.stack_of_open_elements.pop();
                this.insertion_mode = MODE.after_head;
            }
            else
            {
                this.parse_error();
            }
        }
        else
        {
            this.stack_of_open_elements.pop();
            this.insertion_mode = MODE.after_head;
            return true;
        }

        return false;
    }
    private after_head_mode(t: TOKEN): boolean
    {
        if (t.is(...unsupported_tags))
        {
            throw new Error(`HTML tag ${t.content} is not supported.`);
        }
        else if (t.type == TOKEN_TYPE.character && is_white_char(t.content))
        {
            (this.last as ELEMENT).insert_char(t.content);
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.last.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag)
        {
            if (t.is("html"))
            {
                this.in_body_mode(t);
            }
            else if (t.is("body"))
            {
                this.insert_element(t);
                this.insertion_mode = MODE.in_body;
            }
            else if (t.is("title", "meta"))
            {
                this.parse_error();
                this.stack_of_open_elements.push(this.head);
                this.in_head_mode(t);
                this.stack_of_open_elements.pop();
            }
            else if (t.is("head"))
            {
                this.parse_error();
            }
            else
            {
                this.insert_element("body");
                this.insertion_mode = MODE.in_body;
                return true;
            }
        }
        else if (t.type == TOKEN_TYPE.end_tag && !["body", "html", "br"].includes(t.content))
        {
            this.parse_error();
        }
        else
        {
            this.insert_element("body");
            this.insertion_mode = MODE.in_body;
            return true;
        }
        return false;
    }
    private in_body_mode(t: TOKEN): boolean
    {
        function has_implicit_end_tag(element_name: string): boolean
        {
            return ["dd", "dt", "li", "optgroup", "option", "p", "rb",
                    "rp", "rt", "rtc", "tbody", "td", "tfoot", "th",
                    "thead", "tr", "body", "html"].includes(element_name);
        }

        if (t.is(...unsupported_tags))
        {
            throw new Error(`HTML tag ${t.content} is not supported.`);
        }
        else if (t.type == TOKEN_TYPE.character)
        {
            if (t.content == '\0')
            {
                this.parse_error();
            }
            else
            {
                this.last.insert_char(t.content);
            }
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.last.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag)
        {
            if (t.is("html"))
            {
                 this.parse_error();

                 for (const a in t.attributes)
                 {
                     this.stack_of_open_elements[0].attributes[a] ??= t.attributes[a];
                 }
            }
            else if (t.is("title", "meta"))
            {
                return this.in_head_mode(t);
            }
            else if (t.is("body"))
            {
                this.parse_error();
                if (this.stack_of_open_elements.length > 1 && this.stack_of_open_elements[1].name == "body")
                {
                    for (const a in t.attributes)
                    {
                        this.last.attributes[a] ??= t.attributes[a];
                    }
                }
            }
            //"address", "article", "aside", "blockquote", "center", "details", "dialog"
            // "dir", "div", "dl", "fieldset", "figcaption", "figure", "footer", "header"
            // "hgroup", "main", "menu", "nav", "ol", "search", "section", "summary", "ul"
            else if (t.is("p"))
            {
                if (this.has_an_element_in_scope("p"))
                {
                    this.close("p");
                }
                this.insert_element(t);
            }
            else if (t.is(...headings))
            {
                if (this.has_an_element_in_scope("p"))
                {
                    this.close("p");
                }
                if (this.last.is(...headings))
                {
                    this.parse_error();
                    this.stack_of_open_elements.pop();
                }
                this.insert_element(t);
            }
            else if (t.is(...formatting))
            {
                this.insert_element(t);
            }
            else if (t.is("br"))
            {
                this.insert_element(t);
                this.stack_of_open_elements.pop();
            }
            else
            {
                throw new Error(`HTML tag ${t.content} is not supported.`);
            }
        }
        else if (t.type == TOKEN_TYPE.end_tag)
        {
            if (t.is("body", "html"))
            {
                if (this.has_an_element_in_scope("body"))
                {
                    this.parse_error();
                    return false;
                }
                for (const e of this.stack_of_open_elements)
                {
                    if (!has_implicit_end_tag(e.name))
                    {
                        this.parse_error();
                        break;
                    }
                }
                this.insertion_mode = MODE.after_body;
                return (t.content == "html");
            }
            else if (t.is("p"))
            {
                if (!this.has_an_element_in_scope("p"))
                {
                    this.parse_error();
                    this.insert_element("p");
                }
                this.close("p");
            }
            else if (t.is(...headings))
            {
                if (!this.has_an_element_in_scope(t.content))
                {
                    this.parse_error();
                }
                else
                {
                    this.close(t.content);
                }
            }
            else if (t.is(...formatting))
            {
                this.stack_of_open_elements.pop();
            }
            else if (t.is("br"))
            {
                this.parse_error();
                this.insert_element(t);
                this.stack_of_open_elements.pop();
            }
            else
            {
                throw new Error(`HTML tag ${t.content} is not supported.`);
            }
        }
        else if (t.type == TOKEN_TYPE.eof)
        {
            for (const e of this.stack_of_open_elements)
            {
                if (!has_implicit_end_tag(e.name))
                {
                    this.parse_error();
                    break;
                }
            }
            this.stop_parsing();
        }

        return false;
    }
    private text_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character)
        {
            this.last.insert_char(t.content);
        }
        else
        {
            if (t.type == TOKEN_TYPE.eof)
            {
                this.parse_error();
            }
            this.stack_of_open_elements.pop();
            this.insertion_mode = this.original_mode;
        }
        return false;
    }
    private after_body_mode(t: TOKEN): boolean
    {
        if (t.type == TOKEN_TYPE.character && is_white_char(t.content))
        {
            this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.comment)
        {
            this.last.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.doctype)
        {
            this.parse_error();
        }
        else if (t.type == TOKEN_TYPE.start_tag && t.content == "html")
        {
            return this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.end_tag && t.content == "html")
        {
            this.insertion_mode = MODE.after_after_body;
        }
        else if (t.type == TOKEN_TYPE.eof)
        {
            this.stop_parsing();
        }
        else
        {
            this.parse_error();
            this.insertion_mode = MODE.in_body;
            return true;
        }
        return false;
    }
    private after_after_body_mode(t: TOKEN): boolean
    {
        
        if (t.type == TOKEN_TYPE.comment)
        {
            this._root.add_child(NODE.from_comment(t));
        }
        else if (t.type == TOKEN_TYPE.doctype || (t.type == TOKEN_TYPE.character && is_white_char(t.content)) || (t.type == TOKEN_TYPE.start_tag && t.content == "html"))
        {
            return this.in_body_mode(t);
        }
        else if (t.type == TOKEN_TYPE.eof)
        {
            this.stop_parsing();
        }
        else
        {
            this.parse_error();
            this.insertion_mode = MODE.in_body;
            return true;
        }
        return false;
    }

    public receive_token(t: TOKEN): void
    {
        let reprocess_token = false;
        do
        {
            reprocess_token = this.mode_handlers[this.insertion_mode](t);
        }
        while (reprocess_token);
    }
}
