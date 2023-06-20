import {EventEmitter} from "node:events";

import {BUFFER} from "./buffer";
import {TOKEN, TOKEN_TYPE} from "./token";
import {EOF, REPLACEMENT} from "./char";
import {is_ascii_letter, is_ascii_upper, is_white_char} from "./char";

enum STATE
{
    data, 
    markup_declaration_open, DOCTYPE, cdata_section,
    
    comment_start, comment_start_dash, comment, comment_end, comment_end_dash,
    comment_less_than_sign, comment_less_than_sign_bang, bogus_comment,
    comment_less_than_sign_bang_dash, comment_less_than_sign_bang_dash_dash,
    comment_end_bang,

    tag_open, end_tag_open, tag_name, self_closing_start_tag,
    
    character_reference, 
    before_attribute_name
}

const e = new EventEmitter();

let state: STATE;
let return_state: STATE;
let token: TOKEN;
let buffer: BUFFER;

function emit_error(message: string): void
{
    e.emit("parse_error", message)
}
function emit_token(): void
{
    e.emit("token", token);
    token = null;
}
function emit_new_token(type: TOKEN_TYPE, content = ""): void
{
    e.emit("token", new TOKEN(type, content));
}

function data_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '&':
            return_state = STATE.data;
            state = STATE.character_reference;
            break;
        case '<':
            state = STATE.tag_open;
            break;
        case '\0':
            emit_error("unexpected null character");
            emit_new_token(TOKEN_TYPE.character, ch);
            break;
        case EOF:
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            emit_new_token(TOKEN_TYPE.character, ch);
            break;
    }
}
function tag_open_state(): void
{
    const ch = buffer.read();
    if (ch == '!')
    {
        state = STATE.markup_declaration_open;
    }
    else if (ch == '/')
    {
        state = STATE.end_tag_open;
    }
    else if (is_ascii_letter(ch))
    {
        token = new TOKEN(TOKEN_TYPE.start_tag, "");
        buffer.send_back();
        state = STATE.tag_name;
    }
    else if (ch == '?')
    {
        emit_error("unexpected question mark instead of tag name");
        token = new TOKEN(TOKEN_TYPE.comment, "");
        buffer.send_back();
        state = STATE.bogus_comment;
    }
    else if (ch == EOF)
    {
        emit_error("EOF before tag name");
        emit_new_token(TOKEN_TYPE.character, '<');
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        emit_error("invalid first character of tag name");
        emit_new_token(TOKEN_TYPE.character, '<');
        buffer.send_back();
        state = STATE.data;
    }
}
function end_tag_open_state(): void
{
    const ch = buffer.read();
    if (is_ascii_letter(ch))
    {
        token = new TOKEN(TOKEN_TYPE.end_tag, "");
        buffer.send_back();
        state = STATE.tag_name;
    }
    else if (ch == '>')
    {
        emit_error("missing end tag name");
        state = STATE.data;
    }
    else if (ch == EOF)
    {
        emit_error("EOF before tag name");
        emit_new_token(TOKEN_TYPE.character, '<');
        emit_new_token(TOKEN_TYPE.character, '/');
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        emit_error("invalid first character of tag name");
        token = new TOKEN(TOKEN_TYPE.comment, "");
        buffer.send_back();
        state = STATE.bogus_comment;
    }
}
function tag_name_state(): void
{
    let ch = buffer.read();
    if (is_white_char(ch))
    {
        state = STATE.before_attribute_name;
    }
    else if (ch == '/')
    {
        state = STATE.self_closing_start_tag;
    }
    else if (ch == '>')
    {
        state = STATE.data;
        emit_token();
        token = null;
    }
    else if (is_ascii_upper(ch))
    {
        ch = ch.toLowerCase();
        token.add(ch);
    }
    else if (ch == '\0')
    {
        emit_error("unexpected null character");
        token.add(REPLACEMENT);
    }
    else if (ch == EOF)
    {
        emit_error("eof in tag");
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        token.add(ch);
    }
}
function self_closing_start_tag_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case ">":
            token.self_closing = true;
            state = STATE.data;
            emit_token();
            break;
        case EOF:
            emit_error("eof in tag");
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            emit_error("unexpected solidus in tag");
            buffer.send_back();
            state = STATE.before_attribute_name;
    }
}
function bogus_comment_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '>':
            state = STATE.data;
            emit_token();
            break;
        case EOF:
            emit_token();
            emit_new_token(TOKEN_TYPE.eof);
            break;
        case '\0':
            emit_error("unexpected null character");
            token.add(REPLACEMENT);
            break;
        default:
            token.add(ch);
            break;
    }
}
function markup_declaration_open_state(): void
{
    if (buffer.look("--"))
    {
        token = new TOKEN(TOKEN_TYPE.comment, "");
        state = STATE.comment_start;
    }
    else if (buffer.look("DOCTYPE", true))
    {
        state = STATE.DOCTYPE;
    }
    else if (buffer.look("[CDATA["))
    {
        //TODO zamyslet se nad tím, jak má tato podmínka vypadat 
        if (false)
        {
            state = STATE.cdata_section;
        }
        else
        {
            emit_error("cdata in html content");
            token = new TOKEN(TOKEN_TYPE.comment, "[CDATA[");
            state = STATE.bogus_comment;
        }
    }
    else
    {
        emit_error("incorrectly opened comment");
        token = new TOKEN(TOKEN_TYPE.comment, "");
        state = STATE.bogus_comment;
    }
}

function comment_start_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '-':
            state = STATE.comment_start_dash;
            break;
        case '>':
            emit_error("abrupt closing of empty comment");
            state = STATE.data;
            emit_token();
            break;
        default:
            buffer.send_back();
            state = STATE.comment;
    }
}
function comment_start_dash_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '-':
            state = STATE.comment_end;
            break;
        case '>':
            emit_error("abrupt closing of empty comment");
            state = STATE.data;
            emit_token();
            break;
        case EOF:
            emit_error("eof in comment");
            emit_token();
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add('-');
            buffer.send_back();
            state = STATE.comment;
    }
}
function comment_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case "<":
            token.add(ch);
            state = STATE.comment_less_than_sign;
            break;
        case "-":
            state = STATE.comment_end_dash;
            break;
        case '\0':
            emit_error("unexpected null character");
            token.add(REPLACEMENT);
            break;
        case EOF:
            emit_error("eof in comment");
            emit_token();
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add(ch);
            break;
    }
}
function comment_less_than_sign_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case "!":
            token.add(ch);
            state = STATE.comment_less_than_sign_bang;
            break;
        case "<":
            token.add(ch);
            break;
        default:
            buffer.send_back();
            state = STATE.comment;
            break;
    }
}
function comment_less_than_sign_bang_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case "-":
            state = STATE.comment_less_than_sign_bang_dash;
            break;
        default:
            buffer.send_back();
            state = STATE.comment;
            break;
    }
}
function comment_less_than_sign_bang_dash_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case "-":
            state = STATE.comment_less_than_sign_bang_dash_dash;
            break;
        default:
            buffer.send_back();
            state = STATE.comment_end_dash;
            break;
    }
}
function comment_less_than_sign_bang_dash_dash_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case ">":
        case EOF:
            buffer.send_back();
            state = STATE.comment_end;
            break;
        default:
            emit_error("nested comment");
            buffer.send_back();
            state = STATE.comment_end;
            break;
    }
}
function comment_end_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '>':
            emit_token();
            state = STATE.data;
            break;
        case '!':
            state = STATE.comment_end_bang;
            break;
        case '-':
            token.add('-');
            break;
        case EOF:
            emit_error("eof in comment");
            emit_token();
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add('--');
            buffer.send_back();
            state = STATE.comment;
            break;
    }
}
function comment_end_dash_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '-':
            state = STATE.comment_end;
            break;
        case EOF:
            emit_error("eof in comment");
            emit_token();
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add('-');
            buffer.send_back();
            state = STATE.comment;
            break;
    }
}
function comment_end_bang_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '-':
            token.add("--!");
            state = STATE.comment_end_dash;
            break;
        case '>':
            emit_error("incorrectly closed comment");
            emit_token();
            state = STATE.data;
            break;
        case EOF:
            emit_error("eof in comment");
            emit_token();
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add("--!");
            buffer.send_back();
            state = STATE.comment;
            break;
    }
}

export function tokenise(b: BUFFER, parse_error_handler: (message: string) => void, token_handler: (t: TOKEN) => void): void
{
    e.on("parse_error", parse_error_handler);
    e.on("token", token_handler);

    state = STATE.data;
    token = null;
    buffer = b;
    
    const state_handlers: Record<STATE, () => void> =
    {
        [STATE.data]: data_state,
        [STATE.tag_open]: tag_open_state,
        [STATE.end_tag_open]: end_tag_open_state,
        [STATE.tag_name]: tag_name_state,
        [STATE.self_closing_start_tag]: self_closing_start_tag_state,
        [STATE.bogus_comment]: bogus_comment_state,
        [STATE.markup_declaration_open]: markup_declaration_open_state,
        [STATE.character_reference]: null,
        [STATE.before_attribute_name]: null,
        [STATE.DOCTYPE]: null,
        [STATE.cdata_section]: null,
        
        [STATE.comment]: comment_state,
        [STATE.comment_start]: comment_start_state,
        [STATE.comment_start_dash]: comment_start_dash_state,
        [STATE.comment_less_than_sign]: comment_less_than_sign_state,
        [STATE.comment_less_than_sign_bang]: comment_less_than_sign_bang_state,
        [STATE.comment_less_than_sign_bang_dash]: comment_less_than_sign_bang_dash_state,
        [STATE.comment_less_than_sign_bang_dash_dash]: comment_less_than_sign_bang_dash_dash_state,
        [STATE.comment_end]: comment_end_state,
        [STATE.comment_end_dash]: comment_end_dash_state,
        [STATE.comment_end_bang]: comment_end_bang_state
    }
    
    while (!buffer.empty())
    {
        state_handlers[state]();
    }
}