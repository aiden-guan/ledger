import * as cheerio from 'cheerio';

/**
 * Extracts a product's price from an HTML page. Strategies in order of reliability:
 *   1. schema.org Product JSON-LD (offers.price / AggregateOffer.lowPrice)
 *   2. Open Graph / product meta tags
 *   3. schema.org microdata (itemprop="price")
 *   4. Common price selectors as a last resort
 * Returns null price when nothing trustworthy is found; the Actor never guesses.
 */

const CURRENCY_SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', 'C$': 'CAD', 'A$': 'AUD' };

/** @param {unknown} value */
export function parsePrice(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    let text = String(value).trim().replace(/[^\d.,]/g, '');
    if (!text) return null;
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d{2}$/.test(text)) text = text.replace(',', '.');
    else text = text.replace(/,/g, '');
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

/** @param {unknown} value */
export function normalizeAvailability(value) {
    const v = String(value ?? '').toLowerCase();
    if (!v) return 'unknown';
    if (v.includes('outofstock') || v.includes('out of stock') || v.includes('soldout') || v.includes('discontinued')) return 'out_of_stock';
    if (v.includes('limited') || v.includes('lowstock')) return 'limited';
    if (v.includes('instock') || v.includes('in stock') || v.includes('preorder') || v.includes('onlineonly')) return 'in_stock';
    return 'unknown';
}

/** @param {unknown} node @returns {any[]} */
function flattenJsonLd(node) {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap(flattenJsonLd);
    if (typeof node === 'object') {
        const obj = /** @type {Record<string, unknown>} */ (node);
        const variants = Array.isArray(obj.hasVariant) ? obj.hasVariant.map((v) => ({ ...v, name: `${obj.name ?? ''} ${v.name ?? ''}`.trim() })) : [];
        return [obj, ...flattenJsonLd(obj['@graph']), ...flattenJsonLd(obj.mainEntity), ...flattenJsonLd(variants)];
    }
    return [];
}

/** @param {any} node */
function isProduct(node) {
    const type = node?.['@type'];
    return Array.isArray(type) ? type.includes('Product') : type === 'Product';
}

/** @param {cheerio.CheerioAPI} $ */
function fromJsonLd($) {
    const scripts = $('script[type="application/ld+json"]').toArray();
    for (const el of scripts) {
        let data;
        try {
            data = JSON.parse($(el).contents().text());
        } catch {
            continue;
        }
        const product = flattenJsonLd(data).find(isProduct);
        if (!product) continue;
        const offers = Array.isArray(product.offers) ? product.offers : [product.offers].filter(Boolean);
        for (const offer of offers) {
            const price = parsePrice(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price);
            if (price) {
                return {
                    price,
                    currency: offer.priceCurrency ?? offer.priceSpecification?.priceCurrency ?? null,
                    availability: normalizeAvailability(offer.availability),
                    productName: product.name ?? null,
                    method: 'json-ld',
                };
            }
        }
    }
    return null;
}

/** @param {cheerio.CheerioAPI} $ */
function fromMeta($) {
    const amount = $('meta[property="product:price:amount"]').attr('content')
        ?? $('meta[property="og:price:amount"]').attr('content');
    const price = parsePrice(amount);
    if (!price) return null;
    return {
        price,
        currency: $('meta[property="product:price:currency"]').attr('content') ?? $('meta[property="og:price:currency"]').attr('content') ?? null,
        availability: normalizeAvailability($('meta[property="product:availability"]').attr('content') ?? $('meta[property="og:availability"]').attr('content')),
        productName: $('meta[property="og:title"]').attr('content') ?? null,
        method: 'meta',
    };
}

/** @param {cheerio.CheerioAPI} $ */
function fromMicrodata($) {
    const el = $('[itemprop="price"]').first();
    if (!el.length) return null;
    const price = parsePrice(el.attr('content') ?? el.text());
    if (!price) return null;
    const scope = el.closest('[itemtype*="Product"]');
    return {
        price,
        currency: $('[itemprop="priceCurrency"]').first().attr('content') ?? null,
        availability: normalizeAvailability($('[itemprop="availability"]').first().attr('href') ?? $('[itemprop="availability"]').first().attr('content')),
        productName: scope.find('[itemprop="name"]').first().text().trim() || null,
        method: 'microdata',
    };
}

/** @param {cheerio.CheerioAPI} $ */
function fromSelectors($) {
    const selectors = ['.sales .value[content]', '[itemprop="price"][content]', '[data-price]', '.price__current', '.product-price', '.price', '#price'];
    for (const selector of selectors) {
        const el = $(selector).first();
        if (!el.length) continue;
        const attribute = el.attr('content') ?? el.attr('data-price');
        const rawText = attribute && /^\d/.test(attribute) ? attribute : el.text();
        const price = parsePrice(rawText);
        if (!price) continue;
        const symbol = Object.keys(CURRENCY_SYMBOLS).find((s) => el.text().includes(s));
        return { price, currency: symbol ? CURRENCY_SYMBOLS[symbol] : null, availability: 'unknown', productName: null, method: 'selector' };
    }
    return null;
}

/**
 * @param {string} html
 * @returns {{ price: number | null, currency: string | null, availability: string, productName: string | null, method: string | null }}
 */
export function extractProduct(html) {
    const $ = cheerio.load(html);
    const result = fromJsonLd($) ?? fromMeta($) ?? fromMicrodata($) ?? fromSelectors($);
    const fallbackName = $('meta[property="og:title"]').attr('content') ?? $('h1').first().text().trim() ?? $('title').text().trim();
    if (!result) return { price: null, currency: null, availability: 'unknown', productName: fallbackName || null, method: null };
    return {
        ...result,
        currency: result.currency?.toUpperCase() ?? null,
        productName: result.productName || fallbackName || null,
    };
}
