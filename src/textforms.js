
/**
 * @class TextForms:
 */

var TextForms = function () {

    this.clear();

    this._re = {
        decimal: /\./,
        boundary: /\s*#\s*/,
        numeric: /\d+(?:\.(?:\d+)?)?/,
    };

    this._re.numeric_only = new RegExp(
        '^\\s*' + this.embed_re(this._re.numeric) + '\\s*$'
    );

    this._re.field = new RegExp(
        '\\s*([A-Za-z_\\.\\*\\-.]+)(' +
            this.embed_re(this._re.numeric) + ')?(?:\\s+(.+))?'
    );
};

TextForms.prototype = {

    /**
     * @name embed_re
     * Given a javascript `RegExp` object in `_regex`, return a string
     * version of the regular expression, suitable for embedding within
     * another larger regular expression via `new RegExp(...)`.
     */
    embed_re: function (_regex) {

        return _regex.toString().replace(/^\//, '').replace(/\/$/, '');
    },

    /**
     * @name trim:
     * Return a trimmed version of the string `_s` -- that is, a version
     * with whitespace removed from the beginning and end of the string.
     */
    trim: function (_s) {

        return _s.replace(/^\s+/, '').replace(/\s+$/, '');
    },

    /**
     * @name type_of:
     *  Determines the TextForms type for the string `_s`.
     */
    type_of: function (_s) {

        if (_s.match(this._re.numeric_only)) {
            if (_s.match(this._re.decimal)) {
                return 'numeric';
            } else {
                return 'integer';
            }
        } else {
            return 'string';
        }
    },

    /**
     * @name format_as:
     *  Given a string `_value` with type `_type`, this function
     *  "casts" `_value` to the appropriate javascript type.
     */
    format_as: function (_type, _value) {

        switch (_type) {
            case 'integer':
                return parseInt(_value, 10);
            case 'numeric':
                return parseFloat(_value);
            default:
                break;
        }

        return _value;
    },

    /**
     * @name set_result:
     *  Insert a result in to the TextForms result buffer.
     *  If a result for `_key` already exists, the value is
     *  promoted to an array and multiple values are stored
     *  in the sequence that they appeared.
     */
    set_result: function (_key, _value) {

        var key = _key.toUpperCase();

        if (this._result[key] === undefined) {

            /* Single pair result */
            this._result[key] = _value;

        } else if (this._result[key] instanceof Array) {

            /* Second-or-later pair result */
            this._result[key].push(_value);

        } else {

            /* First pair result */
            this._result[key] = [ this._result[key], _value ];
        }
    },

    /**
     * @name parse:
     * Given a TextForms-encoded input string in `_input`, decode
     * the string and place the results in the result buffer of
     * the TextForms instance `this`.
     */
    parse: function (_input) {

        /* Find all message components:
            Each message component is a distinct TextForms "field". */

        var fields = _input.split(this._re.boundary);

        for (var i = 0, len = fields.length; i < len; ++i) {

            /* Process message component:
                Each component has a key (which is the field's name), plus
                either: (i) a value written with an explicit whitespace
                separator (stored in `other`) or (ii) a value written with
                an implicit separator (in `numeric`, and never a string). */
                
            var m = fields[i].match(this._re.field);

            /* Empty component:
                Skip a completely-empty component (i.e. a non-match) */

            if (!m) {
                continue;
            }
            
            /* Capture subgroups:
                These refer to the `this._re.field` regular expression. */

            var key = m[1], numeric = m[2], other = m[3];

            /* Whitespace-only value of `other`?:
                Interpret as non-match, preventing pair formation (below). */

            if (other !== undefined && this.trim(other) === '') {
                other = undefined;
            }

            /* If `numeric` *and* `other` both match text:
                This is either a field name that ends in a digit, a field
                name with multiple values specified, or a single value in a
                sequence (with an offset and value). This condition needs
                to be disambiguated by comparing against a schema (later). */

            if (other !== undefined && numeric !== undefined) {

                var numeric_type = this.type_of(numeric);
                var other_type = this.type_of(other);

                var result = {
                    type: 'pair',
                    values: [
                        { type: numeric_type,
                          value: this.format_as(numeric_type, numeric) },
                        { type: other_type,
                          value: this.format_as(other_type, other) }
                    ],
                };

                this.set_result(key, result);
                continue;
            }

            /* Number written with explicit separator?
                If there was an explicit space between the field's key
                and a numeric value, "promote" the value to numeric. */

            if (other && this.type_of(other) !== 'string') {
                numeric = other;
                other = undefined;
            }

            /* Data type detection:
                Given numeric data, differentiate between an integer
                and a decimal value. Otherwise, just store the string. */

            if (numeric !== undefined) {

                var type = this.type_of(numeric);

                /* Differentiate integer from numeric:
                    The type here will never be string, per the regex. */

                if (type === 'integer') {
                    this.set_result(key, {
                        type: type,
                        value: this.format_as(type, numeric)
                    });
                } else {
                    this.set_result(key, {
                        type: 'numeric',
                        value: this.format_as('numeric', numeric)
                    });
                }

            } else {

                /* Store string as-is */
                this.set_result(key, {
                    type: 'string', value: other
                });
            }
        }

        return this;
    },

    /**
     * @name clear:
     *  Clear the TextForms result buffer, discarding any previous
     *  results stored by the `parse` method.
     */
    clear: function () {

        this._result = {};
    },

    /**
     * @name result:
     *  Return the TextForms result buffer, containing the output of
     *  one or more `parse` operations.
     */
    result: function () {

        return this._result;
    },

    /**
     * @name run_test:
     *  Run a single test from the testsuite. The `_name` is an
     *  external identifier for the test, `_message` is the encoded
     *  TextForms message to be parsed, and `_expect` is a javascript
     *  object that contains the expected (parsed) results.
     */
    run_test: function (_name, _message, _expect) {

        var json_expect = JSON.stringify(_expect);
        var json_actual = JSON.stringify(this.parse(_message).result());

        this.clear();

        if (json_expect === json_actual) {

            console.log('Test `' + _name + '`: Passed');
            return true;

        } else {

            console.log('Test `' + _name + '`: Failed');
            console.log(
                '  Detail: Expected `' + json_expect +
                    '`, but encountered `' + json_actual + '`'
            );
        }

        return false;
    },

    /**
     * @name testsuite:
     *  Run the TextForms parser's internal test suite. This pairs
     *  sample messages with known-good output, and is helpful in
     *  determining whether the parser is functional on a particular
     *  interpreter, or in a particular environment.
     */
    testsuite: function () {
        t.run_test(
            'simple',
            'INT 1# NUM1.0#STR A String Value # PI3.14', {
                INT: { type: 'integer', value: 1 },
                NUM: { type: 'numeric', value: 1.0 },
                STR: { type: 'string', value: 'A String Value' },
                PI: { type: 'numeric', value: 3.14 }
            }
        );
        t.run_test(
            'multiple',
            'vAl 1#VAL 1.0#Val One# val One Point Zero', {
                VAL: [
                    { type: 'integer', value: 1 },
                    { type: 'numeric', value: 1.0 },
                    { type: 'string', value: 'One' },
                    { type: 'string', value: 'One Point Zero' },
                ]
            }
        );
        t.run_test(
            'sequences',
            'I0 0 # SEQ.0 3.1 # SEQ.1 3.14# SEQ2 3.141 #SEQ3 3.1415 ## ', {
                'I': (
                    /* Single value for `I`, therefore not an array */
                    { type: 'pair', values: [
                      /* Values read from left-to-right */
                      { type: 'integer', value: 0 },
                      { type: 'integer', value: 0 } ] }
                ),
                'SEQ.': [
                    /* Array */
                    { type: 'pair', values: [
                      { type: 'integer', value: 0 },
                      { type: 'numeric', value: 3.1 } ] },
                    { type: 'pair', values: [
                      { type: 'integer', value: 1 },
                      { type: 'numeric', value: 3.14 } ] }
                ],
                'SEQ': [
                    /* Array */
                    { type: 'pair', values: [
                      { type: 'integer', value: 2 },
                      { type: 'numeric', value: 3.141 } ] },
                    { type: 'pair', values: [
                      { type: 'integer', value: 3 },
                      { type: 'numeric', value: 3.1415 } ] }
                ]
            }
        );
        t.run_test(
            'ambiguous-values',
            'PRI 1 #NAME2 2.151th Test Message#NUM3 TEST 3.1 # PI 3.14159  ###  #', {
                PRI: { type: 'integer', value: 1 },
                NAME: { type: 'pair', values: [
                            { type: 'integer', value: 2 },
                            { type: 'string', value: '2.151th Test Message' } ] },
                NUM: { type: 'pair', values: [
                            { type: 'integer', value: 3 },
                            { type: 'string', value: 'TEST 3.1' } ] },
                PI: { type: 'numeric', value: 3.14159 }
            }
        );
    }

};

/**
 * Entry Point:
 *  Currently, this just runs the test suite and exits.
 */

var t = new TextForms();
t.testsuite();

