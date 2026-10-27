import{t as e}from"./format-C49kLsPa.js";function t(e,t){if(!e)return null;let n=e.replace(/[^\d]/g,``);return n?`https://wa.me/${n.startsWith(`0`)?`263${n.slice(1)}`:n}?text=${encodeURIComponent(t)}`:null}function n(t,n,r){return t.filter(e=>e.name.trim()).map(t=>`- ${t.quantity} x ${t.name} (${r} ${e(t.unitPrice,n)})`).join(`
`)}function r(t,r,i,a,o){return[`Hi ${t}, here's your order from ${r}:`,n(i,o,`@`),`Total: ${e(a.total,o)}`,`Let us know if you'd like to go ahead!`].join(`

`)}function i(e,t,n){return[`You're invited to join ${e} on BusinessOS AI as ${t}.`,`Open this link to accept: ${n}`].join(`

`)}function a(t,r,i,a,o){return[`Hi ${t}, we'd like to order the following from ${r}:`,n(i,o,`est.`),`Estimated total: ${e(a.total,o)}`,`Please confirm availability and current pricing.`].join(`

`)}export{t as i,a as n,r,i as t};