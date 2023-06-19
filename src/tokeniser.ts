import {EventEmitter} from "node:events";

import {CHAR, EOF, REPLACEMENT} from "./char";
import {is_ascii_letter, is_ascii_upper, is_white_char} from "./char";
import {TOKEN, TOKEN_TYPE} from "./token";

enum STATE
{
    data, tag_open, end_tag_open, tag_name, self_closing_start_tag, bogus_comment,
    character_reference, markup_declaration_open, before_attribute_name
}

const e = new EventEmitter();

let state: STATE;
let return_state: STATE;
let token: TOKEN;

let reconsume: (state: STATE) => void;

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

function data_state(c: CHAR): void
{
    switch (c)
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
            emit_new_token(TOKEN_TYPE.character, c);
            break;
        case EOF:
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            emit_new_token(TOKEN_TYPE.character, c);
            break;
    }
}
function tag_open_state(c: CHAR): void
{
    if (c == '!')
    {
        state = STATE.markup_declaration_open;
    }
    else if (c == '/')
    {
        state = STATE.end_tag_open;
    }
    else if (is_ascii_letter(c))
    {
        token = new TOKEN(TOKEN_TYPE.start_tag, "");
        reconsume(STATE.tag_name);
    }
    else if (c == '?')
    {
        emit_error("unexpected question mark instead of tag name");
        token = new TOKEN(TOKEN_TYPE.comment, "");
        reconsume(STATE.bogus_comment);
    }
    else if (c == EOF)
    {
        emit_error("EOF before tag name");
        emit_new_token(TOKEN_TYPE.character, '<');
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        emit_error("invalid first character of tag name");
        emit_new_token(TOKEN_TYPE.character, '<');
        reconsume(STATE.data);
    }
}
function end_tag_open_state(c: CHAR): void
{
    if (is_ascii_letter(c))
    {
        token = new TOKEN(TOKEN_TYPE.end_tag, "");
        reconsume(STATE.tag_name);
    }
    else if (c == '>')
    {
        emit_error("missing end tag name");
        state = STATE.data;
    }
    else if (c == EOF)
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
        reconsume(STATE.bogus_comment);
    }
}
function tag_name_state(c: CHAR): void
{
    if (is_white_char(c))
    {
        state = STATE.before_attribute_name;
    }
    else if (c == '/')
    {
        state = STATE.self_closing_start_tag;
    }
    else if (c == '>')
    {
        state = STATE.data;
        emit_token();
        token = null;
    }
    else if (is_ascii_upper(c))
    {
        c = c.toLowerCase();
        token.add(c);
    }
    else if (c == '\0')
    {
        emit_error("unexpected null character");
        token.add(REPLACEMENT);
    }
    else if (c == EOF)
    {
        emit_error("eof in tag");
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        token.add(c);
    }
}
function self_closing_start_tag_state(c: CHAR): void
{
    switch (c)
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
            reconsume(STATE.before_attribute_name);
    }
}
function bogus_comment_state(c: CHAR): void
{
    switch (c)
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
            token.add(c);
            break;
    }
}

export function tokenise(source: string, parse_error_handler: (message: string) => void, token_handler: (t: TOKEN) => void): void
{
    e.on("parse_error", parse_error_handler);
    e.on("token", token_handler);

    state = STATE.data;
    token = null;

    let f = 0;
    reconsume = function (s: STATE)
    {
        state = s;
        f -= 1;
    }

    const state_handlers: Record<STATE, (c: CHAR) => void> =
    {
        [STATE.data]: data_state,
        [STATE.tag_open]: tag_open_state,
        [STATE.end_tag_open]: end_tag_open_state,
        [STATE.tag_name]: tag_name_state,
        [STATE.self_closing_start_tag]: self_closing_start_tag_state,
        [STATE.bogus_comment]: bogus_comment_state,
        [STATE.character_reference]: null,
        [STATE.markup_declaration_open]: null,
        [STATE.before_attribute_name]: null
    }

    do
    {
        const c = (f < source.length) ? source[f] : EOF;
        state_handlers[state](c);
        f += 1;
    }
    while (f <= source.length);
}