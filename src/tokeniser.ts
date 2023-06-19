import {EventEmitter} from "node:events";

const EOF = "";
const REPLACEMENT = String.fromCharCode(0xFFFD);
type CHAR = string; // used for strings one character long at most

enum TOKEN_TYPE
{
    character = "ch", eof = "EOF", start_tag = "st", end_tag = "et", comment = "c"
}

export class TOKEN
{
    public readonly type: TOKEN_TYPE;
    private content: string;
    public self_closing: boolean;
    
    public constructor(type: TOKEN_TYPE, content = "")
    {
        this.type = type;
        this.content = content;
        this.self_closing = false;
    }

    public to_string(): string
    {
        return `<${this.type}> ${this.content}`;
    }
    public add(c: string): void
    {
        this.content += c;
    }
}

enum STATE
{
    data, tag_open, end_tag_open, tag_name, self_closing_start_tag, bogus_comment
}


const parse_error = "parse_error";
const token = "token";
export class TOKENISER extends EventEmitter
{
    private s: STATE;
    private t: TOKEN;
    private reconsume: ()=>void;

    public constructor(parse_error_handler: (message: string)=>void, token_handler: (t: TOKEN)=>void)
    {
        super();
        this.on(parse_error, parse_error_handler);
        this.on(token, token_handler);
    }

    private on_error(message: string): void
    {
        this.emit(parse_error, message)
    }
    private on_token(t: TOKEN)
    {
        this.emit(token, t);
    }
    
    private is_ascii_upper(c: CHAR): boolean
    {
        if (c == EOF)
        {
            return false;
        }
        else
        {
            const code = c.charCodeAt(0);
            return "A".charCodeAt(0) <= code && code <= "Z".charCodeAt(0);
        }
    }
    private is_ascii_letter(c: CHAR): boolean
    {
        if (c == EOF)
        {
            return false;
        }
        else
        {
            const code = c.charCodeAt(0);
            return ("a".charCodeAt(0) <= code && code <= "z".charCodeAt(0)) || this.is_ascii_upper(c);
        }
    }
    private is_white_char(c: CHAR): boolean
    {
        if (c == EOF)
        {
            return false;
        }
        else
        {
            return [' ', '\t', '\n', '\f'].includes(c);
    
        }
    }

    private data_state(c: CHAR): void
    {
        switch (c)
        {
            case '&': throw new Error("under construction");
            case '<':
                this.s = STATE.tag_open;
                break;
            case EOF:
                this.on_token(new TOKEN(TOKEN_TYPE.eof));
                break;

            case '\0':
                this.on_error("unexpected null character");
                this.on_token(new TOKEN(TOKEN_TYPE.character, c));
                break;
            default:
                this.on_token(new TOKEN(TOKEN_TYPE.character, c));
                break;
        }
    }
    private tag_open_state(c: CHAR): void
    {
        if (c == '!')
        {
            throw new Error("under construction");
        }
        else if (c == '/')
        {
            this.s = STATE.end_tag_open;
        }
        else if (this.is_ascii_letter(c))
        {
            this.t = new TOKEN(TOKEN_TYPE.start_tag, "");
            this.s = STATE.tag_name;
            this.reconsume();
        }
        else if (c == '?')
        {
            this.on_error("unexpected question mark instead of tag name");
            this.t = new TOKEN(TOKEN_TYPE.comment, "");
            this.s = STATE.bogus_comment;
            this.reconsume();
        }
        else if (c == EOF)
        {
            this.on_error("EOF before tag name");
            this.on_token(new TOKEN(TOKEN_TYPE.character, '<'));
            this.on_token(new TOKEN(TOKEN_TYPE.eof));
        }
        else
        {
            this.on_error("invalid first character of tag name");
            this.on_token(new TOKEN(TOKEN_TYPE.character, '<'));
            this.s = STATE.data;
            this.reconsume();
        }
    }
    private end_tag_open_state(c: CHAR): void
    {
        if (this.is_ascii_letter(c))
        {
            this.t = new TOKEN(TOKEN_TYPE.end_tag, "");
            this.s = STATE.tag_name;
            this.reconsume();
        }
        else if (c == '>')
        {
            this.on_error("missing end tag name");
            this.s = STATE.data;
        }
        else if (c == EOF)
        {
            this.on_error("EOF before tag name");
            this.on_token(new TOKEN(TOKEN_TYPE.character, '<'));
            this.on_token(new TOKEN(TOKEN_TYPE.character, '/'));
            this.on_token(new TOKEN(TOKEN_TYPE.eof));
        }
        else
        {
            this.on_error("invalid first character of tag name");
            this.t = new TOKEN(TOKEN_TYPE.comment, "");
            this.s = STATE.bogus_comment;
            this.reconsume();
        }
    }
    private tag_name_state(c: CHAR): void
    {
        if (this.is_white_char(c))
        {
            throw new Error("under construction");
        }
        else if (c == '/')
        {
            this.s = STATE.self_closing_start_tag;
        }
        else if (c == '>')
        {
            this.s = STATE.data;
            this.on_token(this.t);
            this.t = null;
        }
        else if (this.is_ascii_upper(c))
        {
            c = c.toLowerCase();
            this.t.add(c);
        }
        else if (c == '\0')
        {
            this.on_error("unexpected null character");
            this.t.add(REPLACEMENT);
        }
        else if (c == EOF)
        {
            this.on_error("eof in tag");
            this.on_token(new TOKEN(TOKEN_TYPE.eof));
        }
        else
        {
            this.t.add(c);
        }
    }
    private self_closing_start_tag_state(c: CHAR): void
    {
        switch (c)
        {
            case ">":
                this.t.self_closing = true;
                this.s = STATE.data;
                this.on_token(this.t);
                this.t = null;
                break;
            case EOF:
                this.on_error("eof in tag");
                this.on_token(new TOKEN(TOKEN_TYPE.eof));
                break;
            default:
                this.on_error("unexpected solidus in tag");
                throw new Error("under construction");
        }
    }
    private bogus_comment_state(c: CHAR): void
    {
        switch (c)
        {
            case '>':
                this.s = STATE.data;
                this.on_token(this.t);
                this.t = null;
                break;
            case EOF:
                this.on_token(this.t);
                this.on_token(new TOKEN(TOKEN_TYPE.eof));
                this.t = null;
                break;
            case '\0':
                this.on_error("unexpected null character");
                this.t.add(REPLACEMENT);
                break;
            default:
                this.t.add(c);
                break;
        }
    }

    public tokenise(source: string): void
    {
        this.s = STATE.data;
        this.t = null;

        let f = 0;
        this.reconsume = function()
        {
            f -= 1;
        }

        do
        {
            const c = (f < source.length) ? source[f] : EOF;

            switch (this.s as STATE)
            {
                case STATE.data: 
                    this.data_state(c);
                    break;

                case STATE.tag_open:
                    this.tag_open_state(c);
                    break;

                case STATE.end_tag_open:
                    this.end_tag_open_state(c);
                    break;

                case STATE.self_closing_start_tag:
                    this.self_closing_start_tag_state(c);
                    break;

                case STATE.tag_name:
                    this.tag_name_state(c);
                    break;

                case STATE.bogus_comment:
                    this.bogus_comment_state(c);
                    break;
                default:
                    throw new Error("under construction");
            }

            f += 1;
        }
        while (f <= source.length);
    }
}