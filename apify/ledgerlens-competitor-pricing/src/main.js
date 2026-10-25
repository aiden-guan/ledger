import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { extractProduct } from './extract.js';
import { assertPublicUrl } from './url-safety.js';

/**
 * ledgerlens-competitor-pricing
 * Input:  { products: [{ internalProductId, competitor, url }] }
 * Output: one dataset record per page with a trustworthy price:
 *         { internalProductId, competitor, productName, price, currency, availability, url, capturedAt }
 * Pages without an extractable price are recorded in the FAILURES key-value record, never
 * written to the dataset with a guessed value.
 */
await Actor.main(async () => {
    const input = (await Actor.getInput()) ?? {};
    const products = Array.isArray(input.products) ? input.products : [];
    if (products.length === 0) throw new Error('Input must contain a non-empty "products" array');
    if (products.length > 200) throw new Error('At most 200 product pages per run');

    // Local testing only: allows the sandbox storefront on localhost. Never honored on the platform,
    // and every other host still goes through the SSRF guard.
    const allowLocalhost = process.env.LEDGERLENS_ALLOW_PRIVATE_HOSTS === 'true' && !Actor.isAtHome();
    const checkUrl = async (raw) => {
        if (allowLocalhost && ['localhost', '127.0.0.1'].includes(new URL(raw).hostname)) return;
        await assertPublicUrl(raw);
    };

    /** @type {{ url: string, competitor?: string, internalProductId?: string, reason: string }[]} */
    const failures = [];
    const requests = [];
    for (const item of products) {
        const { internalProductId, competitor, url } = item ?? {};
        if (typeof internalProductId !== 'string' || typeof competitor !== 'string' || typeof url !== 'string') {
            failures.push({ url: String(url), reason: 'Invalid product entry' });
            continue;
        }
        try {
            await checkUrl(url);
            const expectedNameTokens = Array.isArray(item.expectedNameTokens) ? item.expectedNameTokens.filter((t) => typeof t === 'string' && t.length > 0).slice(0, 6) : [];
            requests.push({ url, uniqueKey: `${internalProductId}|${competitor}|${url}`, userData: { internalProductId, competitor, expectedNameTokens } });
        } catch (error) {
            failures.push({ url, competitor, internalProductId, reason: error instanceof Error ? error.message : String(error) });
        }
    }

    let written = 0;
    const crawler = new CheerioCrawler({
        maxConcurrency: Math.min(20, Math.max(1, Math.floor(Number(input.maxConcurrency) || 5))),
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 30,
        navigationTimeoutSecs: 30,
        async requestHandler({ request, body }) {
            const { internalProductId, competitor } = request.userData;
            if (request.loadedUrl && request.loadedUrl !== request.url) {
                await checkUrl(request.loadedUrl); // redirects must also stay public
            }
            const extracted = extractProduct(String(body));
            if (!request.userData.expectedNameTokens.every((t) => String(extracted.productName ?? '').toLowerCase().includes(t.toLowerCase()))) {
                failures.push({ url: request.url, competitor, internalProductId, reason: 'Product identity did not match the expected name tokens' });
                return;
            }
            if (!extracted.price || !extracted.currency) {
                failures.push({ url: request.url, competitor, internalProductId, reason: 'No unambiguous price and currency found on page' });
                log.warning(`No price found for ${competitor} at ${request.url}`);
                return;
            }
            await Actor.pushData({
                internalProductId,
                competitor,
                productName: extracted.productName,
                price: extracted.price,
                currency: extracted.currency,
                availability: extracted.availability,
                url: request.loadedUrl ?? request.url,
                capturedAt: new Date().toISOString(),
                extractionMethod: extracted.method,
            });
            written += 1;
            log.info(`${competitor}: ${extracted.currency} ${extracted.price} (${extracted.method})`);
        },
        async failedRequestHandler({ request }, error) {
            const { internalProductId, competitor } = request.userData;
            failures.push({ url: request.url, competitor, internalProductId, reason: error.message });
        },
    });

    if (requests.length > 0) await crawler.run(requests);
    await Actor.setValue('FAILURES', failures);
    await Actor.setValue('SUMMARY', { requested: products.length, extracted: written, failed: failures.length, capturedAt: new Date().toISOString() });
    log.info(`Extracted ${written} prices; ${failures.length} pages failed.`);
});
