import * as _ from "lodash";
import {EventEmitter} from "node:events";

import {BUFFER} from "./buffer";
import {TOKEN, TOKEN_TYPE} from "./token";
import {EOF, REPLACEMENT} from "./char";
import {is_ascii_letter, is_ascii_lower, is_ascii_upper, is_white_char} from "./char";

export enum STATE
{
    data, 
    markup_declaration_open, DOCTYPE, cdata_section,
    
    comment_start, comment_start_dash, comment, comment_end, comment_end_dash,
    comment_less_than_sign, comment_less_than_sign_bang, bogus_comment,
    comment_less_than_sign_bang_dash, comment_less_than_sign_bang_dash_dash,
    comment_end_bang,

    tag_open, end_tag_open, tag_name, self_closing_start_tag,
    
    character_reference,

    before_attribute_name, attribute_name, after_attribute_name,
    before_attribute_value, attribute_value_unquoted, after_attribute_value_quoted,
    attribute_value_single_quoted, attribute_value_double_quoted,

    rcdata, rcdata_less_than_sign, rcdata_end_tag_open, rcdata_end_tag_name
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
    if (token.type == TOKEN_TYPE.end_tag)
    {
        if (!_.isEqual(token.attributes, {}))
        {
            emit_error("end tag with attributes");
        }
        else if (token.self_closing)
        {
            emit_error("end tag with trailing solidus")
        }
    }

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
    const ch = buffer.read();
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
        token.add(ch.toLowerCase());
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

function before_attribute_name_state(): void
{
    const ch = buffer.read();
    if (ch == '/' || ch == '>' || ch == EOF)
    {
        buffer.send_back();
        state = STATE.after_attribute_name;
    }
    else if (ch == '=')
    {
        emit_error("unexpected equals sign before attribute name");
        token.new_attribute(ch);
        state = STATE.attribute_name;
    }
    else if (!is_white_char(ch))
    {
        token.new_attribute();
        buffer.send_back();
        state = STATE.attribute_name;
    }
}
function attribute_name_state(): void
{
    let ch = buffer.read();
    if (is_white_char(ch) || [EOF, '/', '>'].includes(ch))
    {
        buffer.send_back();
        state = STATE.after_attribute_name;
    }
    else if (ch == '=')
    {
        state = STATE.before_attribute_value;
    }
    else if (is_ascii_upper(ch))
    {
        ch = ch.toLowerCase();
        token.add_to_attribute_name(ch);
    }
    else if (ch == '\0')
    {
        emit_error("unexpected null character");
        token.add_to_attribute_name(REPLACEMENT);
    }
    else if (['"', "'", '<'].includes(ch))
    {
        emit_error("unexpected character in attribute name");
        token.add_to_attribute_name(ch);
    }
    else
    {
        token.add_to_attribute_name(ch);
    }

}
function after_attribute_name_state(): void
{
    const ch = buffer.read();
    if (ch == '/')
    {
        token.set_attribute(emit_error);
        state = STATE.self_closing_start_tag;
    }
    else if (ch == '=')
    {
        state = STATE.before_attribute_value;
    }
    else if (ch == '>')
    {
        token.set_attribute(emit_error);
        emit_token();
        state = STATE.data;
    }
    else if (ch == EOF)
    {
        emit_error("eof in tag");
        emit_new_token(TOKEN_TYPE.eof);
    }
    else if (!is_white_char(ch))
    {
        token.set_attribute(emit_error);
        token.new_attribute();
        buffer.send_back();
        state = STATE.attribute_name;
    }
}
function before_attribute_value_state(): void
{
    const ch = buffer.read();
    if (ch == '"')
    {
        state = STATE.attribute_value_double_quoted;
    }
    else if (ch == "'")
    {
        state = STATE.attribute_value_single_quoted
    }
    else if (ch == '>')
    {
        emit_error("missing attribute value");
        token.set_attribute(emit_error);
        emit_token();
        state = STATE.data;
    }
    else if (!is_white_char(ch))
    {
        buffer.send_back();
        state = STATE.attribute_value_unquoted;
    }
}
function attribute_value_double_quoted_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '"':
            token.set_attribute(emit_error);
            state = STATE.after_attribute_value_quoted;
            break;
        case '&':
            return_state = STATE.attribute_value_unquoted;
            state = STATE.character_reference;
            break;
        case '\0':
            emit_error("unexpected null character");
            token.add_to_attribute_value(REPLACEMENT);
            break;
        case EOF:
            emit_error("eof in tag");
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add_to_attribute_value(ch);
            break;
    }
}
function attribute_value_single_quoted_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case "'":
            token.set_attribute(emit_error);
            state = STATE.after_attribute_value_quoted;
            break;
        case '&':
            return_state = STATE.attribute_value_single_quoted;
            state = STATE.character_reference;
            break;
        case '\0':
            emit_error("unexpected null character");
            token.add_to_attribute_value(REPLACEMENT);
            break;
        case EOF:
            emit_error("eof in tag");
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            token.add_to_attribute_value(ch);
            break;
    }
}
function attribute_value_unquoted_state(): void
{
    const ch = buffer.read();
    if (is_white_char(ch))
    {
        token.set_attribute(emit_error);
        state = STATE.before_attribute_name;
    }
    else if (ch == '&')
    {
        return_state = STATE.attribute_value_unquoted;
        state = STATE.character_reference;
    }
    else if (ch == '>')
    {
        token.set_attribute(emit_error);
        emit_token();
        state = STATE.data;
    }
    else if (ch == '\0')
    {
        emit_error("unexpected null character");
        token.add_to_attribute_value(REPLACEMENT);
    }
    else if (['"', "'", '<', '=', '`'].includes(ch))
    {
        emit_error("unexpected character in unquoted attribute value");
        token.add_to_attribute_value(ch);
    }
    else if (ch == EOF)
    {
        emit_error("eof in tag");
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        token.add_to_attribute_value(ch);
    }
}
function after_attribute_value_quoted_state(): void
{
    const ch = buffer.read();
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
        emit_token();
        state = STATE.data;
    }
    else if (ch == EOF)
    {
        emit_error("eof in tag");
        emit_new_token(TOKEN_TYPE.eof);
    }
    else
    {
        emit_error("missing whitespace between attributes");
        buffer.send_back();
        state = STATE.before_attribute_name;
    }
}

let appropriate_end_tag_name: string;
let temporary_buffer: string;
function rcdata_state(): void
{
    const ch = buffer.read();
    switch (ch)
    {
        case '&':
            return_state = STATE.rcdata;
            state = STATE.character_reference;
            break;
        case '<':
            state = STATE.rcdata_less_than_sign;
            break;
        case '\0':
            emit_error("unexpected null character");
            emit_new_token(TOKEN_TYPE.character, REPLACEMENT);
            break;
        case EOF:
            emit_new_token(TOKEN_TYPE.eof);
            break;
        default:
            emit_new_token(TOKEN_TYPE.character, ch);
            break;
    }
}
function rcdata_less_than_sign_state(): void
{
    const ch = buffer.read();
    if (ch == '/')
    {
        temporary_buffer = "";
        state = STATE.rcdata_end_tag_open;
    }
    else
    {
        emit_new_token(TOKEN_TYPE.character, '<');
        buffer.send_back();
        state = STATE.rcdata;
    }
}
function rcdata_end_tag_open_state(): void
{
    const ch = buffer.read();
    if (is_ascii_letter(ch))
    {
        token = new TOKEN(TOKEN_TYPE.end_tag);
        buffer.send_back();
        state = STATE.rcdata_end_tag_name;
    }
    else
    {
        emit_new_token(TOKEN_TYPE.character, '<');
        emit_new_token(TOKEN_TYPE.character, '/');
        buffer.send_back();
        state = STATE.rcdata;
    }
}
function rcdata_end_tag_name_state(): void
{
    const ch = buffer.read();
    if (is_white_char(ch) && token.content == appropriate_end_tag_name)
    {
        state = STATE.before_attribute_name;
    }
    else if (ch == '/' && token.content == appropriate_end_tag_name)
    {
        state = STATE.self_closing_start_tag;
    }
    else if (ch == '>' && token.content == appropriate_end_tag_name)
    {
        emit_token();
        state = STATE.data;
    }
    else if (is_ascii_upper(ch))
    {
        token.add(ch.toLowerCase());
        temporary_buffer += ch;
    }
    else if (is_ascii_lower(ch))
    {
        token.add(ch);
        temporary_buffer += ch;
    }
    else
    {
        emit_new_token(TOKEN_TYPE.character, '<');
        emit_new_token(TOKEN_TYPE.character, '/');

        for (const char of temporary_buffer)
        {
            emit_new_token(TOKEN_TYPE.character, char);
        }

        buffer.send_back();
        state = STATE.rcdata;
    }
}

export function switch_state(s: STATE, expected_end_tag_name: string)
{
    state = s;
    appropriate_end_tag_name = expected_end_tag_name;
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
        [STATE.comment_end_bang]: comment_end_bang_state,

        [STATE.before_attribute_name]: before_attribute_name_state,
        [STATE.attribute_name]: attribute_name_state,
        [STATE.after_attribute_name]: after_attribute_name_state,
        [STATE.before_attribute_value]: before_attribute_value_state,
        [STATE.attribute_value_unquoted]: attribute_value_unquoted_state,
        [STATE.after_attribute_value_quoted]: after_attribute_value_quoted_state,
        [STATE.attribute_value_single_quoted]: attribute_value_single_quoted_state,
        [STATE.attribute_value_double_quoted]: attribute_value_double_quoted_state,

        [STATE.rcdata]: rcdata_state,
        [STATE.rcdata_less_than_sign]: rcdata_less_than_sign_state,
        [STATE.rcdata_end_tag_open]: rcdata_end_tag_open_state,
        [STATE.rcdata_end_tag_name]: rcdata_end_tag_name_state
    }
    
    while (!buffer.empty())
    {
        state_handlers[state]();
    }
}
