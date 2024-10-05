/*

GlkOte input handlers
=====================

Copyright (c) 2024 Dannii Willis
MIT licenced
https://github.com/curiousdannii/asyncglk

*/
import {throttle} from 'lodash-es'

import {KEY_CODE_DOWN, KEY_CODE_RETURN, KEY_CODE_UP, KEY_CODES_TO_NAMES, OFFSCREEN_OFFSET} from '../../common/constants.js'
import {is_pinch_zoomed} from '../../common/misc.js'
import * as protocol from '../../common/protocol.js'

import {apply_text_run_styles, type Window} from './windows.js'

const MAX_HISTORY_LENGTH = 25

export class TextInput {
    el: JQuery<HTMLElement>
    history_index = 0
    is_line = false
    window: Window

    constructor(window: Window) {
        this.window = window

        // We use a textarea rather than an input because mobile Chrome shows an extra bar which can't be removed
        // See https://github.com/curiousdannii/asyncglk/issues/30
        this.el = $('<textarea>', {
            'aria-hidden': 'true',
            autocapitalize: 'off',
            class: 'Input',
            data: {
                window,
            },
            on: {
                blur: () => this.onblur(),
                focus: () => this.onfocus(),
                input: (ev: any) => this.oninput(ev),
                keydown: (ev: JQuery.KeyDownEvent) => this.onkeydown(ev),
                keypress: (ev: JQuery.KeyPressEvent) => this.onkeypress(ev),
            },
            rows: 1,
        })
            .prop('disabled', true)
            .appendTo(window.frameel)
    }

    destroy() {
        this.el.remove()
    }

    private onblur() {
        scroll_window()
    }

    private onfocus() {
        // Ensure a buffer window is scrolled down
        if (this.window.type === 'buffer' && !is_pinch_zoomed()) {
            this.window.scroll_to_bottom()
        }
        // Scroll the browser window over the next 600ms
        scroll_window()
    }

    /** The keydown and keypress inputs are unreliable in mobile browsers with virtual keyboards. This handler can handle character input for printable characters, but not function/arrow keys */
    private oninput(ev: any) {
        // This input shouldn't be active
        if (!this.window.inputs?.type) {
            this.el.trigger('blur')
            return false
        }

        if (this.window.inputs.type === 'char') {
            const char = ev.target.value[0]
            this.submit_char(char)
            // Even though we have reset and emptied the input, Android acts as though it still has spaces within it, and won't send backspace keydown events until the phantom spaces have all been deleted. Refocusing seems to fix it.
            if (char === ' ') {
                this.el.trigger('blur').trigger('focus')
            }
            return false
        }
    }

    private onkeydown(ev: JQuery.KeyDownEvent) {
        // This input shouldn't be active
        if (!this.window.inputs?.type) {
            this.el.trigger('blur')
            return false
        }

        const keycode = ev.which
        if (!keycode) {
            return
        }

        if (this.is_line) {
            // History
            if (keycode === KEY_CODE_DOWN || keycode === KEY_CODE_UP) {
                const history = this.window.manager.history
                let changed
                if (keycode === KEY_CODE_DOWN && this.history_index > 0) {
                    this.history_index--
                    changed = 1
                }
                else if (keycode === KEY_CODE_UP && this.history_index < history.length) {
                    this.history_index++
                    changed = 1
                }
                if (changed) {
                    this.el.val(this.history_index === 0 ? '' : history[this.history_index - 1])
                }
                return false
            }

            // Terminator for this input
            else if (this.window.inputs!.terminators) {
                const terminator = KEY_CODES_TO_NAMES[keycode] as protocol.TerminatorCode
                if (this.window.inputs!.terminators.includes(terminator)) {
                    this.submit_line(ev.target.value, terminator)
                    return false
                }
            }
        }
        // Character input
        else {
            const code = KEY_CODES_TO_NAMES[keycode]
            if (code) {
                this.submit_char(code)
                return false
            }
        }

        // Don't propagate, so that document.keydown doesn't trigger
        ev.stopPropagation()
    }

    private onkeypress(ev: JQuery.KeyPressEvent) {
        // This input shouldn't be active
        if (!this.window.inputs?.type) {
            this.el.trigger('blur')
            return false
        }

        const keycode = ev.which
        if (!keycode) {
            return
        }

        // Submit line input
        if (this.is_line) {
            if (keycode === KEY_CODE_RETURN) {
                this.submit_line(ev.target.value)
                return false
            }
        }
        // Character input
        else {
            const code = keycode === KEY_CODE_RETURN ? 'return' : String.fromCharCode(keycode)
            this.submit_char(code)
            return false
        }
    }

    /** Refocus the input, if it wouldn't obscure part of the update */
    // On Android this forces the window to be scrolled down to the bottom, so only refocus if the virtual keyboard doesn't make the window too small for the full update text to be seen
    refocus() {
        if (this.window.type === 'buffer') {
            const updateheight = this.window.innerel.outerHeight()! - this.window.updatescrolltop
            if (updateheight > this.window.height_above_keyboard) {
                return
            }
        }
        this.el[0].focus({preventScroll: true})
    }

    reset() {
        this.history_index = 0
        this.el
            .attr({
                'aria-hidden': 'true',
                class: 'Input',
            })
            .css({
                'background-color': '',
                color: '',
                left: OFFSCREEN_OFFSET,
                top: '',
                width: '',
            })
            .val('')
        const inputparent = this.window.type === 'buffer' ? this.window.innerel : this.window.frameel
        if (!this.el.parent().is(inputparent)) {
            this.el.appendTo(inputparent)
        }
    }

    private submit_char(val: string) {
        this.window.send_text_event({
            type: 'char',
            value: val,
        })
    }

    private submit_line(val: string, terminator?: protocol.TerminatorCode) {
        // Insert a history item if it's not blank and also not the same as the last one
        const history = this.window.manager.history
        if (val && val !== history[0]) {
            history.unshift(val)
            if (history.length > MAX_HISTORY_LENGTH) {
                history.length = MAX_HISTORY_LENGTH
            }
        }

        this.window.send_text_event({
            type: 'line',
            terminator,
            value: val,
        })
    }

    update() {
        // Start from a clean slate
        this.reset()

        const update = this.window.inputs!
        if (update.type !== 'char' && update.type !== 'line') {
            return
        }
        this.is_line = update.type === 'line'

        // Common options for both character and line input
        this.el
            .attr({
                'aria-hidden': 'false',
                maxlength: this.is_line ? update.maxlen! : 1,
            })
            .prop('disabled', false)
            .val(update.initial || '')

        if (this.is_line) {
            if (this.window.type === 'graphics') {
                throw new Error(`Cannot request line input in graphics window ${this.window.id}`)
            }
            this.el.addClass('LineInput')
        }

        // Position the input element within the window
        switch (this.window.type) {
            case 'buffer':
                (this.window.lastline || this.window.innerel).append(this.el)
                break
            case 'grid': {
                const metrics = this.window.metrics
                this.el.css({
                    left: update.xpos! * metrics.gridcharwidth + (metrics.gridmarginx / 2),
                    top: update.ypos! * metrics.gridcharheight + (metrics.gridmarginy / 2),
                    width: (update.maxlen || 1) * metrics.gridcharwidth,
                })
                break
            }
        }

        // Set text style
        if (this.window.type !== 'graphics') {
            const css_styles = this.window.last_run_styles
            if (css_styles) {
                const reverse = !!css_styles.reverse
                this.el.toggleClass('reverse', reverse)
                apply_text_run_styles(css_styles, reverse, this.el)
            }
        }
    }
}

/* A little helper function to repeatedly scroll the window, because iOS sometimes scrolls badly
   On iOS, when focusing the soft keyboard, the keyboard animates in over 500ms
   This would normally cover up the focused input, so iOS cleverly tries to
   scroll the top-level window down to bring the input into the view
   But we know better: we want to scroll the input's window frame to the bottom,
   without scrolling the top-level window at all. */
const scroll_window = throttle(() => {
    function do_scroll(count: number) {
        window.scrollTo(0, 0)
        if (count > 0) {
            setTimeout(do_scroll, 50, count - 1)
        }
    }
    do_scroll(12)
}, 1000)