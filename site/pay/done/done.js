(function () {
  OW.$('top').innerHTML = OW.brand('/');
  var ok = /[?&]ok=1/.test(location.search);
  OW.$('h').textContent = ok ? 'Thank you, we received your payment' : 'Payment was not completed';
  OW.$('p').textContent = ok ? 'We emailed you a receipt. Your signed agreement or visit report is released in your customer portal about three business days after you paid, once the payment has cleared. We will email you when it is ready.' : 'You were not charged. You can pay later with the link in your invoice email, or from your customer portal.';
})();
