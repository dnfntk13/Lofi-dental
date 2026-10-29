import { readFileSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const origin = 'https://lofiesthetic.com';
const priceUrl = `${origin}/price-guide.html`;
const treatmentIds = ['clear-aligners', 'dental-implants', 'crowns', 'fillings', 'veneers', 'whitening', 'extraction', 'checkup-cleaning'];
const guideIds = ['smile-makeover', 'dental-veneers', 'dental-implants', 'full-mouth-restoration', 'teeth-whitening'];
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const text = value => value.replace(/<[^>]*>/g, ' ').replaceAll('&amp;', '&').replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim();
const result = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const noArguments = z.object({}).strict();
const publicUrl = z.string().url();
const publicOperation = operation => async args => {
  try { return await operation(args); }
  catch { return { isError: true, content: [{ type: 'text', text: 'Published clinic information is temporarily unavailable. Please use https://lofiesthetic.com/ or contact the clinic.' }] }; }
};

// Only public, reviewed website files are available to this server. No admin,
// inbox, database, reservation or messaging modules are imported here.
export function createPublicLofiServer(rootDir) {
  const read = file => readFileSync(path.join(rootDir, file), 'utf8');
  const prices = () => {
    const html = read('price-guide.html');
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    return { html, graph, catalog: graph.find(item => item['@type'] === 'OfferCatalog') };
  };
  const server = new McpServer({ name: 'lofi-esthetic-dentistry', version: '1.0.0' }, {
    instructions: 'Public clinic information only. Prices are guides, not personal quotes or proof of insurance coverage. These tools do not accept patient information, diagnose, book, change appointments or send messages. Use the returned public sources. English is the default language.',
  });

  server.registerTool('get_dental_prices', {
    title: 'Compare Lofi dental prices',
    description: 'Retrieve the published Lofi dental fee guide in KRW for selected treatments and insurance columns. Use for price comparisons at this clinic. Enrollment-based clinic fees do not establish insurance coverage. Does not quote a personal treatment plan or collect patient information.',
    inputSchema: z.object({
      treatments: z.array(z.enum(treatmentIds)).min(1).max(8).optional().describe('Omit to show all eight published treatments.'),
      insurance: z.enum(['both', 'with-knhi', 'without-knhi']).optional().describe('Published price column to display, not an insurance eligibility check.'),
    }).strict(),
    outputSchema: z.object({
      pricesReviewedOn: z.string(),
      prices: z.array(z.object({ treatment: z.string(), insuranceColumn: z.string(), currency: z.literal('KRW'), minPrice: z.number().optional(), maxPrice: z.number().optional(), price: z.number().optional(), unit: z.string().optional(), source: publicUrl })),
      conditions: z.string(), source: publicUrl,
    }),
    annotations,
  }, publicOperation(async ({ treatments, insurance = 'both' }) => {
    const { html, catalog } = prices();
    const rows = catalog.itemListElement.filter((offer, index) => (!treatments || treatments.includes(treatmentIds[Math.floor(index / 2)])) && (insurance === 'both' || (insurance === 'with-knhi' ? index % 2 === 0 : index % 2 === 1))).map(offer => {
      const price = offer.priceSpecification;
      return { treatment: offer.itemOffered.name, insuranceColumn: offer.name.split(' — ')[1], currency: price.priceCurrency, ...(price.price === undefined ? { minPrice: price.minPrice, maxPrice: price.maxPrice } : { price: price.price }), ...(offer.itemOffered.description ? { unit: offer.itemOffered.description } : {}), source: offer.url };
    });
    return result({ pricesReviewedOn: html.match(/<time datetime="([^"]+)">/)[1], prices: rows, conditions: catalog.description, source: priceUrl });
  }));

  server.registerTool('get_price_questions', {
    title: 'Read Lofi price and insurance explanations',
    description: 'Retrieve the published Lofi FAQ explaining KNHI price columns, implant and veneer fees, cleaning, taxes and additional procedures. Provides general published information only; cannot determine personal coverage or treatment suitability.',
    inputSchema: noArguments,
    outputSchema: z.object({ questions: z.array(z.object({ question: z.string(), answer: z.string(), source: publicUrl })) }),
    annotations,
  }, publicOperation(async () => result({ questions: prices().graph.find(item => item['@type'] === 'FAQPage').mainEntity.map(item => ({ question: item.name, answer: item.acceptedAnswer.text, source: item['@id'] })) })));

  server.registerTool('get_clinic_information', {
    title: 'Find Lofi location, hours and contact options',
    description: 'Retrieve Lofi clinic address, published regular hours, phone, email and its contact-information page. Use to plan a visit or find how to contact the clinic. Does not check appointment availability, make bookings or send messages.',
    inputSchema: noArguments,
    outputSchema: z.object({ name: z.string(), address: z.string(), regularHours: z.string(), timezone: z.literal('Asia/Seoul'), phone: z.string(), email: z.string(), contactInformationUrl: publicUrl, note: z.string(), source: publicUrl }),
    annotations,
  }, publicOperation(async () => {
    const html = read('english/index.html');
    const hours = html.match(/<aside class="opening-banner"[^>]*>([\s\S]*?)<\/aside>/)?.[1];
    const address = html.match(/<span class="contact-address">([\s\S]*?)<\/span>/)?.[1];
    if (!hours || !address) throw new Error('Published clinic details unavailable');
    return result({ name: 'lofi esthetic dentistry', address: text(address), regularHours: text(hours), timezone: 'Asia/Seoul', phone: html.match(/href="tel:([^"]+)"/)[1], email: html.match(/href="mailto:([^"]+)"/)[1], contactInformationUrl: `${origin}/contact-options.html`, note: 'Regular hours do not confirm holiday opening or appointment availability. Confirm with the clinic before your visit.', source: origin + '/' });
  }));

  server.registerTool('get_treatment_guide', {
    title: 'Read a Lofi treatment overview',
    description: 'Retrieve one published general overview of smile makeover, veneers, implants, full mouth restoration or whitening. Helps explain treatment concepts and planning questions. Does not evaluate symptoms, photos, records or suitability and does not recommend treatment for an individual.',
    inputSchema: z.object({ treatment: z.enum(guideIds) }).strict(),
    outputSchema: z.object({ overview: z.array(z.string()), source: publicUrl, scope: z.string() }),
    annotations,
  }, publicOperation(async ({ treatment }) => {
    const html = read('english/index.html');
    const article = html.match(new RegExp(`<article class="treatment-article" id="${treatment}"[\\s\\S]*?<\\/article>`))?.[0];
    if (!article) throw new Error('Published treatment guide unavailable');
    const paragraphs = [...article.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(match => text(match[1]));
    const url = article.match(/href="(\/[^"]+)"/)?.[1];
    return result({ overview: paragraphs, source: url ? origin + url : `${origin}/#${treatment}`, scope: 'General clinic information; an examination and discussion with the dentist are needed for an individual plan.' });
  }));
  return server;
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let bytes = 0, chunks = [], tooLarge = false;
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { tooLarge = true; chunks = []; }
      else if (!tooLarge) chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request too large'), { status: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

export function createPublicLofiMcpHandler(rootDir) {
  return async (request, response) => {
    const allowedHostnames = ['lofiesthetic.com', 'www.lofiesthetic.com', 'lofi-dental.onrender.com', 'localhost', '127.0.0.1', '[::1]'];
    const allowedOrigins = ['https://chatgpt.com', 'https://chat.openai.com', origin];
    const requestOrigin = request.headers.origin;
    const reject = (status, message) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ error: message })); };
    response.setHeader('Cache-Control', 'no-store');
    let hostname;
    try { hostname = new URL(`http://${request.headers.host}`).hostname; } catch { return reject(403, 'Host not allowed'); }
    if (!allowedHostnames.includes(hostname)) return reject(403, 'Host not allowed');
    const allowedHosts = [request.headers.host];
    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) return reject(403, 'Origin not allowed');
    if (requestOrigin) response.setHeader('Access-Control-Allow-Origin', requestOrigin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id', 'Access-Control-Expose-Headers': 'Mcp-Session-Id' });
      response.end(); return;
    }
    if (!['POST', 'GET', 'DELETE'].includes(request.method)) return reject(405, 'Method not allowed');
    if (Number(request.headers['content-length']) > 16384) { request.resume(); return reject(413, 'Request too large'); }
    if (request.method === 'POST' && !/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) return reject(415, 'JSON required');
    const server = createPublicLofiServer(rootDir);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, enableDnsRebindingProtection: true, allowedHosts, allowedOrigins });
    response.on('close', () => { void transport.close(); void server.close(); });
    try {
      const body = request.method === 'POST' ? await readBody(request, 16384) : undefined;
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch (error) {
      // No request payloads, headers or raw exceptions enter application logs.
      if (!response.headersSent) reject(error.status || 500, error.status ? error.message : 'Public clinic information unavailable');
    }
  };
}
