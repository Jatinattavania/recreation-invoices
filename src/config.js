/* =====================================================================
   DEFAULTS — first-run settings. Everything here is editable in Settings.
   ===================================================================== */
export const DEFAULT_SETTINGS = {
  studioName: 'ReCreation Studio',
  address: '[YOUR ADDRESS]',
  email: '[YOUR EMAIL]',
  phone: '[YOUR PHONE]',
  website: '',
  gstin: '[YOUR GSTIN]',
  pan: '',
  logo: '',                       // '' = the built-in ReCreation Studio artwork (brand.js)
  bank: { holder: '[NAME]', name: '[BANK NAME]', account: '[ACCOUNT NUMBER]', ifsc: '[IFSC]', branch: '', upi: '[UPI ID]' },
  showQR: true,
  payQR: '',                      // an uploaded QR image we couldn't read — printed as-is
  payQRData: '',                  // what your uploaded QR says (e.g. upi://pay?pa=…); redrawn cleanly on every invoice
  serial: { prefix: 'RCS-', quotePrefix: 'RCS-Q-', yearly: false, pad: 4 },
  // GST is built in but switched off for now; turning it on in Settings brings
  // back the tax controls, CGST/SGST/IGST rows and GSTIN lines.
  gstEnabled: false,
  defaultTax: 18,
  defaultTaxMode: 'split',
  defaultTerms: 15,
  defaultTemplate: 'bold',
  defaultNotes: 'Thank you for your business. Please quote the invoice number with your payment.',
  defaultTermsText: 'Final files and usage rights transfer on receipt of full payment.',
  thanks: 'It was a pleasure working with you.',
  quoteValidDays: 30,
  defaultQuoteNotes: 'Thank you for the opportunity. Happy to answer any questions about this quotation.',
  defaultQuoteTerms: 'Prices are in INR. Work begins once this quotation is accepted.',
  defaultAcceptText: 'Reply to this message or email to accept, and an invoice will follow.',
};
// Quotes and invoices share the designs; these are the words that change.
export const DOC_TEXT = {
  invoice: { title: 'Invoice', short: 'Invoice', amount: 'Amount due', due: 'Due', total: 'Total due' },
  quote: { title: 'Quotation', short: 'Quote', amount: 'Quoted total', due: 'Valid until', total: 'Quoted total' },
};
export const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', partial: 'Part paid', paid: 'Paid', overdue: 'Overdue', accepted: 'Accepted', declined: 'Declined' };
export const STATUSES = { invoice: ['draft', 'sent', 'paid'], quote: ['draft', 'sent', 'accepted', 'declined'] };
// localStorage keys that hold your data (a change to any of them triggers an automatic backup)
export const DATA_KEYS = ['settings', 'invoices', 'clients', 'services', 'logos', 'counter', 'counterQ', 'used'];
export const START_NUMBER = 1;
export const TERMS = [0, 7, 15, 30, 45];
// Each design has its own palette: Bold's block colour, Grid's highlighter, Soft's accent.
export const TEMPLATES = {
  bold: { name: 'Bold', swatches: ['#2D3BFF', '#FF5B2E', '#0E9F6E', '#111114'] },
  grid: { name: 'Grid', swatches: ['#D7FF3A', '#FFD84D', '#FF9EC8', '#9AD8FF'] },
  soft: { name: 'Soft', swatches: ['#6D5EF5', '#0EA5E9', '#10B981', '#F43F5E'] },
};
export const AVATAR_COLORS = ['#6D5EF5', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#2D3BFF', '#D946EF', '#14B8A6'];
export const PAGE_W = 794, PAGE_H = 1123;
// GST (CGST/SGST/IGST and GSTIN lines) is switched off entirely: no tax rows, no tax in
// any total, no GST controls. The code is kept; set GST_FEATURE to true to bring it back.
export const GST_FEATURE = false;
