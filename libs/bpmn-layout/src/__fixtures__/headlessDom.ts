/**
 * The DOM surface jsdom does not implement, filled in far enough to run a real
 * bpmn-js modeler headless.
 *
 * diagram-js renders through `tiny-svg`, which reads `node.transform.baseVal`
 * and multiplies `SVGMatrix` values to maintain the viewbox. jsdom provides
 * neither, so both are implemented here — the matrix arithmetic for real,
 * since consolidating a transform list is what the canvas viewbox is derived
 * from, and a stub returning identity would silently answer a different
 * question.
 *
 * Measurement (`getBBox`, text metrics) is stubbed with zeroes instead: it
 * depends on font rasterisation that no headless DOM can supply. Nothing
 * asserted by these tests reads it — element bounds come from the model, which
 * bpmn-js maintains independently of what the browser paints.
 */

interface Matrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(left: Matrix, right: Matrix): Matrix {
    return {
        a: left.a * right.a + left.c * right.b,
        b: left.b * right.a + left.d * right.b,
        c: left.a * right.c + left.c * right.d,
        d: left.b * right.c + left.d * right.d,
        e: left.a * right.e + left.c * right.f + left.e,
        f: left.b * right.e + left.d * right.f + left.f,
    };
}

/**
 * A real class, not a plain object: `tiny-svg` branches on
 * `transform instanceof SVGMatrix` to decide whether to wrap a value, and
 * jsdom defines no such global — so the shim has to be both the constructor
 * that name resolves to and the type its own matrices satisfy.
 */
class SVGMatrixShim implements Matrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(values: Matrix = IDENTITY) {
        Object.assign(this, values);
    }

    multiply(other: Matrix): SVGMatrixShim {
        return new SVGMatrixShim(multiply(this, other));
    }

    translate(x: number, y: number): SVGMatrixShim {
        return this.multiply({ ...IDENTITY, e: x, f: y });
    }

    scale(factor: number): SVGMatrixShim {
        return this.multiply({ ...IDENTITY, a: factor, d: factor });
    }

    scaleNonUniform(x: number, y: number): SVGMatrixShim {
        return this.multiply({ ...IDENTITY, a: x, d: y });
    }

    flipX(): SVGMatrixShim {
        return this.multiply({ ...IDENTITY, a: -1 });
    }

    flipY(): SVGMatrixShim {
        return this.multiply({ ...IDENTITY, d: -1 });
    }

    inverse(): SVGMatrixShim {
        const determinant = this.a * this.d - this.b * this.c;
        if (determinant === 0) return new SVGMatrixShim();
        return new SVGMatrixShim({
            a: this.d / determinant,
            b: -this.b / determinant,
            c: -this.c / determinant,
            d: this.a / determinant,
            e: (this.c * this.f - this.d * this.e) / determinant,
            f: (this.b * this.e - this.a * this.f) / determinant,
        });
    }
}

function createMatrix(values: Matrix = IDENTITY): SVGMatrixShim {
    return new SVGMatrixShim(values);
}

/** The mutators diagram-js's `SvgTransformUtil` drives on an `SVGTransform`. */
function createTransform(values: Matrix = IDENTITY) {
    const transform = {
        type: 1,
        matrix: createMatrix(values),
        setMatrix(next: Matrix) {
            transform.matrix = createMatrix(next);
        },
        setTranslate(x: number, y: number) {
            transform.matrix = createMatrix({ ...IDENTITY, e: x, f: y });
        },
        setScale(x: number, y: number) {
            transform.matrix = createMatrix({ ...IDENTITY, a: x, d: y });
        },
        setRotate(angle: number, cx = 0, cy = 0) {
            const radians = (angle * Math.PI) / 180;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            // Rotation about (cx, cy), not the origin.
            transform.matrix = createMatrix({
                a: cos,
                b: sin,
                c: -sin,
                d: cos,
                e: cx - cos * cx + sin * cy,
                f: cy - sin * cx - cos * cy,
            });
        },
    };
    return transform;
}

type Transform = ReturnType<typeof createTransform>;

/** The slice of `SVGTransformList` tiny-svg drives. */
function createTransformList() {
    const items: Transform[] = [];

    return {
        get numberOfItems() {
            return items.length;
        },
        clear: () => items.splice(0, items.length),
        appendItem: (item: Transform) => {
            items.push(item);
            return item;
        },
        initialize: (item: Transform) => {
            items.splice(0, items.length, item);
            return item;
        },
        getItem: (index: number) => items[index],
        // Null for an empty list, as the real API does — diagram-js falls back
        // to a fresh identity matrix on null.
        consolidate: () =>
            items.length === 0
                ? null
                : createTransform(
                      items.reduce((acc, item) => multiply(acc, item.matrix), IDENTITY),
                  ),
    };
}

const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0 };

const LINE_HEIGHT = 14;

/**
 * Text measurement, which diagram-js routes through a 2D canvas context
 * (`Text.getTextBBox`). jsdom defines `getContext` but returns `null` from it,
 * so the stub has to *replace* the method rather than fill a gap.
 *
 * The returned metrics must carry the font bounding box as well as the width:
 * diagram-js derives line height from `fontBoundingBoxAscent/Descent`, and
 * without them every line height is `NaN`, which propagates into the label
 * layout instead of failing outright.
 *
 * The width estimate is deliberately crude but *deterministic* and strictly
 * positive — label wrapping shortens a line until it measures narrow enough,
 * so a zero or `NaN` width has no fixed point to stop at.
 */
const AVERAGE_GLYPH_WIDTH = 7;
const ASCENT = 11;
const DESCENT = 3;

function installCanvasStub(): void {
    const canvas = globalThis.HTMLCanvasElement?.prototype as unknown as Record<string, unknown>;
    if (!canvas) return;

    canvas.getContext = function (this: HTMLCanvasElement) {
        return {
            canvas: this,
            font: "",
            letterSpacing: "0px",
            measureText: (text: string) => ({
                width: text.length * AVERAGE_GLYPH_WIDTH,
                fontBoundingBoxAscent: ASCENT,
                fontBoundingBoxDescent: DESCENT,
                actualBoundingBoxAscent: ASCENT,
                actualBoundingBoxDescent: DESCENT,
            }),
            fillText: () => undefined,
            strokeText: () => undefined,
            save: () => undefined,
            restore: () => undefined,
            scale: () => undefined,
            translate: () => undefined,
            clearRect: () => undefined,
        };
    };
}

export function installHeadlessDom(): void {
    const svg = globalThis.SVGElement?.prototype as unknown as Record<string, unknown>;
    if (!svg) throw new Error("no SVGElement — these tests need a DOM environment");
    if (svg.__miragonSvgStubs) return;
    svg.__miragonSvgStubs = true;

    installCanvasStub();

    const globals = globalThis as unknown as Record<string, unknown>;
    globals.SVGMatrix ??= SVGMatrixShim;

    const lists = new WeakMap<object, ReturnType<typeof createTransformList>>();
    Object.defineProperty(svg, "transform", {
        configurable: true,
        get(this: object) {
            let list = lists.get(this);
            if (!list) {
                list = createTransformList();
                lists.set(this, list);
            }
            return { baseVal: list, animVal: list };
        },
    });

    // Proportional, never zero: bpmn-js wraps label text by shrinking the line
    // until it measures narrow enough, so a width of 0 never converges — it
    // spins until the process runs out of memory rather than failing.
    svg.getBBox ??= function (this: SVGElement) {
        const text = this.textContent ?? "";
        return text
            ? { x: 0, y: 0, width: text.length * AVERAGE_GLYPH_WIDTH, height: LINE_HEIGHT }
            : { ...ZERO_RECT };
    };
    svg.getComputedTextLength ??= function (this: SVGElement) {
        return (this.textContent ?? "").length * AVERAGE_GLYPH_WIDTH;
    };
    svg.getSubStringLength ??= (_start: number, length: number) => length * AVERAGE_GLYPH_WIDTH;
    svg.getCTM ??= () => createMatrix();
    svg.getScreenCTM ??= () => createMatrix();
    svg.getStartPositionOfChar ??= () => ({ x: 0, y: 0 });

    const svgSvg = globalThis.SVGSVGElement?.prototype as unknown as Record<string, unknown>;
    if (svgSvg) {
        svgSvg.createSVGMatrix ??= () => createMatrix();
        svgSvg.createSVGTransform ??= () => createTransform();
        svgSvg.createSVGTransformFromMatrix ??= (matrix: Matrix) => createTransform(matrix);
        svgSvg.createSVGPoint ??= () => ({
            x: 0,
            y: 0,
            matrixTransform: () => ({ x: 0, y: 0 }),
        });
        svgSvg.createSVGRect ??= () => ({ ...ZERO_RECT });
        svgSvg.suspendRedraw ??= () => 0;
        svgSvg.unsuspendRedrawAll ??= () => undefined;
        svgSvg.forceRedraw ??= () => undefined;
    }
}
