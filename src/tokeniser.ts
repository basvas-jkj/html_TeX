import {EventEmitter} from "node:events";

import {CHAR, EOF, REPLACEMENT} from "./char";
import {is_ascii_letter, is_ascii_upper, is_white_char} from "./char";

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
    data, tag_open, end_tag_open, tag_name, self_closing_start_tag, bogus_comment,
    character_reference, markup_declaration_open, before_attribute_name
}


const parse_error = "parse_error";
const token = "token";
export class TOKENISER extends EventEmitter
{
    private state: STATE;
    private return_state: STATE;
    private reconsume: (state: STATE)=>void;

    private token: TOKEN;

    public constructor(parse_error_handler: (message: string)=>void, token_handler: (t: TOKEN)=>void)
    {
        super();
        this.on(parse_error, parse_error_handler);
        this.on(token, token_handler);
    }

    private emit_error(message: string): void
    {
        this.emit(parse_error, message)
    }
    private emit_token()
    {
        this.emit(token, this.token);
        this.token = null;
    }
    private emit_new_token(type: TOKEN_TYPE, content = "")
    {
        this.emit(token, new TOKEN(type, content));
    }

    private data_state(c: CHAR): void
    {
        switch (c)
        {
            case '&':
                this.return_state = STATE.data;
                this.state = STATE.character_reference;
                break;
            case '<':
                this.state = STATE.tag_open;
                break;
            case '\0':
                this.emit_error("unexpected null character");
                this.emit_new_token(TOKEN_TYPE.character, c);
                break;
            case EOF:
                this.emit_new_token(TOKEN_TYPE.eof);
                break;
            default:
                this.emit_new_token(TOKEN_TYPE.character, c);
                break;
        }
    }
    private tag_open_state(c: CHAR): void
    {
        if (c == '!')
        {
            this.state = STATE.markup_declaration_open;
        }
        else if (c == '/')
        {
            this.state = STATE.end_tag_open;
        }
        else if (is_ascii_letter(c))
        {
            this.token = new TOKEN(TOKEN_TYPE.start_tag, "");
            this.reconsume(STATE.tag_name);
        }
        else if (c == '?')
        {
            this.emit_error("unexpected question mark instead of tag name");
            this.token = new TOKEN(TOKEN_TYPE.comment, "");
            this.reconsume(STATE.bogus_comment);
        }
        else if (c == EOF)
        {
            this.emit_error("EOF before tag name");
            this.emit_new_token(TOKEN_TYPE.character, '<');
            this.emit_new_token(TOKEN_TYPE.eof);
        }
        else
        {
            this.emit_error("invalid first character of tag name");
            this.emit_new_token(TOKEN_TYPE.character, '<');
            this.reconsume(STATE.data);
        }
    }
    private end_tag_open_state(c: CHAR): void
    {
        if (is_ascii_letter(c))
        {
            this.token = new TOKEN(TOKEN_TYPE.end_tag, "");
            this.reconsume(STATE.tag_name);
        }
        else if (c == '>')
        {
            this.emit_error("missing end tag name");
            this.state = STATE.data;
        }
        else if (c == EOF)
        {
            this.emit_error("EOF before tag name");
            this.emit_new_token(TOKEN_TYPE.character, '<');
            this.emit_new_token(TOKEN_TYPE.character, '/');
            this.emit_new_token(TOKEN_TYPE.eof);
        }
        else
        {
            this.emit_error("invalid first character of tag name");
            this.token = new TOKEN(TOKEN_TYPE.comment, "");
            this.reconsume(STATE.bogus_comment);
        }
    }
    private tag_name_state(c: CHAR): void
    {
        if (is_white_char(c))
        {
            this.state = STATE.before_attribute_name;
        }
        else if (c == '/')
        {
            this.state = STATE.self_closing_start_tag;
        }
        else if (c == '>')
        {
            this.state = STATE.data;
            this.emit_token();
            this.token = null;
        }
        else if (is_ascii_upper(c))
        {
            c = c.toLowerCase();
            this.token.add(c);
        }
        else if (c == '\0')
        {
            this.emit_error("unexpected null character");
            this.token.add(REPLACEMENT);
        }
        else if (c == EOF)
        {
            this.emit_error("eof in tag");
            this.emit_new_token(TOKEN_TYPE.eof);
        }
        else
        {
            this.token.add(c);
        }
    }
    private self_closing_start_tag_state(c: CHAR): void
    {
        switch (c)
        {
            case ">":
                this.token.self_closing = true;
                this.state = STATE.data;
                this.emit_token();
                break;
            case EOF:
                this.emit_error("eof in tag");
                this.emit_new_token(TOKEN_TYPE.eof);
                break;
            default:
                this.emit_error("unexpected solidus in tag");
                this.reconsume(STATE.before_attribute_name);
        }
    }
    private bogus_comment_state(c: CHAR): void
    {
        switch (c)
        {
            case '>':
                this.state = STATE.data;
                this.emit_token();
                break;
            case EOF:
                this.emit_token();
                this.emit_new_token(TOKEN_TYPE.eof);
                break;
            case '\0':
                this.emit_error("unexpected null character");
                this.token.add(REPLACEMENT);
                break;
            default:
                this.token.add(c);
                break;
        }
    }

    public tokenise(source: string): void
    {
        this.state = STATE.data;
        this.token = null;

        let f = 0;
        this.reconsume = function(state: STATE)
        {
            this.state = state;
            f -= 1;
        }

        do
        {
            const c = (f < source.length) ? source[f] : EOF;

            switch (this.state as STATE)
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