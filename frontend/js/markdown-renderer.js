/*
 * markdown-renderer.js
 *
 * Reusable Markdown + KaTeX + Highlight.js renderer
 */

let markdown = null;


/* =========================================================
   KaTeX plugin
========================================================= */

function katexPlugin(md) {

    /* -----------------------------------------------------
       Block math: $$ ... $$
    ----------------------------------------------------- */

    md.block.ruler.before(
        "fence",
        "math_block",

        function (state, startLine, endLine, silent) {

            const pos =
                state.bMarks[startLine] +
                state.tShift[startLine];

            const max =
                state.eMarks[startLine];

            const line =
                state.src.slice(pos, max);


            if (!line.startsWith("$$"))
                return false;

            if (silent)
                return true;


            let content = "";
            let lastLine = startLine;

            const rest = line.slice(2);


            /*
             * Single-line:
             *
             * $$ x^2 + y^2 = z^2 $$
             */

            if (
                rest.trimEnd().endsWith("$$") &&
                rest.trim().length >= 2
            ) {

                content =
                    rest.trim().slice(0, -2);

            }


            /*
             * Multi-line:
             *
             * $$
             * x^2 + y^2 = z^2
             * $$
             */

            else {

                content = rest;

                let found = false;


                for (
                    let i = startLine + 1;
                    i < endLine;
                    i++
                ) {

                    const p =
                        state.bMarks[i] +
                        state.tShift[i];

                    const m =
                        state.eMarks[i];

                    const line =
                        state.src.slice(p, m);

                    const trimmed =
                        line.trimEnd();


                    if (trimmed.endsWith("$$")) {

                        content +=
                            "\n" +
                            trimmed.slice(0, -2);

                        lastLine = i;

                        found = true;

                        break;
                    }


                    content += "\n" + line;
                }


                if (!found)
                    return false;
            }


            state.line = lastLine + 1;


            const token =
                state.push(
                    "math_block",
                    "math",
                    0
                );


            token.block = true;

            token.content =
                content.trim();

            token.map = [
                startLine,
                state.line
            ];


            return true;
        }
    );


    md.renderer.rules.math_block =
        function (tokens, index) {

            try {

                return katex.renderToString(
                    tokens[index].content,
                    {
                        displayMode: true,
                        throwOnError: false
                    }
                ) + "\n";

            }

            catch (error) {

                return (
                    "<pre>" +
                    md.utils.escapeHtml(
                        tokens[index].content
                    ) +
                    "</pre>\n"
                );
            }
        };


    /* -----------------------------------------------------
       Inline math: $ ... $
    ----------------------------------------------------- */

    md.inline.ruler.after(
        "backticks",
        "math_inline",

        function (state, silent) {

            const source = state.src;

            const start = state.pos;


            if (source[start] !== "$")
                return false;

            if (source[start + 1] === "$")
                return false;

            if (
                start > 0 &&
                source[start - 1] === "\\"
            )
                return false;


            let end = start + 1;


            while (
                (end = source.indexOf("$", end))
                !== -1
            ) {

                if (
                    source[end - 1] !== "\\"
                )
                    break;

                end++;
            }


            if (end === -1)
                return false;


            const content =
                source.slice(
                    start + 1,
                    end
                );


            if (!content.trim())
                return false;

            if (content.includes("\n"))
                return false;

            if (silent)
                return true;


            const token =
                state.push(
                    "math_inline",
                    "math",
                    0
                );


            token.content = content;

            token.markup = "$";


            state.pos = end + 1;


            return true;
        }
    );


    md.renderer.rules.math_inline =
        function (tokens, index) {

            try {

                return katex.renderToString(
                    tokens[index].content,
                    {
                        displayMode: false,
                        throwOnError: false
                    }
                );

            }

            catch (error) {

                return md.utils.escapeHtml(
                    "$" +
                    tokens[index].content +
                    "$"
                );
            }
        };
}


/* =========================================================
   Create renderer
========================================================= */

function createRenderer() {

    const md =
        window.markdownit({

            html: true,

            linkify: true,

            typographer: true,


            /* ---------------------------------------------
               highlight.js
            --------------------------------------------- */

            highlight: function (code, language) {

                if (
                    language &&
                    window.hljs &&
                    hljs.getLanguage(language)
                ) {

                    try {

                        return (
                            '<pre class="hljs"><code>' +

                            hljs.highlight(
                                code,
                                {
                                    language,
                                    ignoreIllegals: true
                                }
                            ).value +

                            "</code></pre>"
                        );

                    }

                    catch (_) {
                        // Fall through
                    }
                }


                /*
                 * Unknown language or no language
                 */

                return (
                    '<pre class="hljs"><code>' +

                    md.utils.escapeHtml(code) +

                    "</code></pre>"
                );
            }
        });


    md.use(katexPlugin);


    return md;
}


/* =========================================================
   Initialize
========================================================= */

function initialize() {

    if (markdown)
        return;


    if (!window.markdownit)
        throw new Error(
            "markdown-it has not been loaded."
        );


    if (!window.katex)
        throw new Error(
            "KaTeX has not been loaded."
        );


    if (!window.hljs)
        throw new Error(
            "highlight.js has not been loaded."
        );


    markdown =
        createRenderer();
}


/* =========================================================
   Render a Markdown string
========================================================= */

export function renderMarkdown(
    text,
    element
) {

    initialize();


    /*
     * Allow either:
     *
     * renderMarkdown(text, element)
     *
     * or:
     *
     * renderMarkdown(text, "#content")
     */

    if (typeof element === "string") {

        element =
            document.querySelector(element);
    }


    if (!element) {

        throw new Error(
            "Markdown target element not found."
        );
    }


    element.innerHTML =
        markdown.render(text);
}


/* =========================================================
   Render a Markdown file
========================================================= */

export async function renderMarkdownFile(
    file,
    element
) {

    initialize();


    if (typeof element === "string") {

        element =
            document.querySelector(element);
    }


    if (!element) {

        throw new Error(
            "Markdown target element not found."
        );
    }


    try {

        const response =
            await fetch(file);


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const text =
            await response.text();


        element.innerHTML =
            markdown.render(text);

    }

    catch (error) {

        element.innerHTML =
            `
            <p class="markdown-error">
                Could not load Markdown:
                ${error.message}
            </p>
            `;

        throw error;
    }
}


/* =========================================================
   Convenience function
========================================================= */

export async function renderMarkdownFiles(
    files
) {

    for (const item of files) {

        await renderMarkdownFile(
            item.file,
            item.element
        );
    }
}