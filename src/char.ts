export const EOF = "";
export const REPLACEMENT = String.fromCharCode(0xFFFD);
export type CHAR = string; // used for strings one character long at most

export function is_ascii_upper(c: CHAR): boolean
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
export function is_ascii_letter(c: CHAR): boolean
{
    if (c == EOF)
    {
        return false;
    }
    else
    {
        const code = c.charCodeAt(0);
        return ("a".charCodeAt(0) <= code && code <= "z".charCodeAt(0)) || is_ascii_upper(c);
    }
}
export function is_white_char(c: CHAR): boolean
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