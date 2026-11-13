(function(){
  'use strict';

  var TO = '270rooftop@gmail.com';
  var WA_NUM = '254702455665';
  var DEFAULT_MSG = "Hello 270\u00B0 Rooftop, I'd like to enquire about a reservation.";
  var CONFIRM = 'confirmation.html';

  var $ = function(id){ return document.getElementById(id); };

  /* ---------- Year ---------- */
  var yr = $('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Header ---------- */
  var hdr = $('hdr');
  var lastY = -1;
  function onScroll(){
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (y > 40 && !hdr.classList.contains('solid')) hdr.classList.add('solid');
    else if (y <= 40 && hdr.classList.contains('solid')) hdr.classList.remove('solid');
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  var burger = $('burger'), mnav = $('mnav');
  function closeNav(){
    mnav.classList.remove('open');
    burger.setAttribute('aria-expanded','false');
    burger.setAttribute('aria-label','Open menu');
    document.body.style.overflow = '';
  }
  burger.addEventListener('click', function(){
    var open = mnav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  Array.prototype.forEach.call(mnav.querySelectorAll('a'), function(a){
    a.addEventListener('click', closeNav);
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && mnav.classList.contains('open')) closeNav();
  });

  /* ---------- Reveal ---------- */
  var rvs = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin:'0px 0px -8% 0px', threshold:0.06 });
    Array.prototype.forEach.call(rvs, function(el){ io.observe(el); });
  } else {
    Array.prototype.forEach.call(rvs, function(el){ el.classList.add('in'); });
  }

  /* ---------- Today highlight + hero hours ---------- */
  var day = new Date().getDay();
  var rows = document.querySelectorAll('#hoursList li');
  Array.prototype.forEach.call(rows, function(li){
    if (parseInt(li.getAttribute('data-d'), 10) === day) li.classList.add('today');
  });
  if ($('heroHours')){
    /* both the weekday and weekend rows close at 10:30 pm */
    var closes = (day === 0 || day === 6) ? '10:30 pm' : '10:30 pm';
    $('heroHours').textContent = closes;
  }

  /* ---------- Date min ---------- */
  function todayISO(){
    var d = new Date();
    d.setHours(12,0,0,0);
    var m = String(d.getMonth()+1), dd = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (dd.length < 2) dd = '0' + dd;
    return d.getFullYear() + '-' + m + '-' + dd;
  }
  var dateEl = $('resDate');
  dateEl.min = todayISO();

  /* ---------- Hours by weekday ---------- */
  var OPEN = { 0:{o:'07:00',c:'22:30'}, 1:{o:'06:00',c:'22:30'}, 2:{o:'06:00',c:'22:30'},
               3:{o:'06:00',c:'22:30'}, 4:{o:'06:00',c:'22:30'}, 5:{o:'06:00',c:'22:30'},
               6:{o:'07:00',c:'22:30'} };

  function fmt12(t){
    var parts = t.split(':');
    var h = parseInt(parts[0], 10), mi = parts[1];
    var ap = h >= 12 ? 'pm' : 'am';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + (mi === '00' ? '' : ':' + mi) + ' ' + ap;
  }
  function fmtDateLong(iso){
    if (!iso) return '';
    var p = iso.split('-');
    var d = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
    var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDateShort(iso){
    if (!iso) return '';
    var p = iso.split('-');
    var d = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
    var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ---------- Validation ---------- */
  var fields = {
    name:   { el:$('resName'),   err:$('errName') },
    phone:  { el:$('resPhone'),  err:$('errPhone') },
    email:  { el:$('resEmail'),  err:$('errEmail') },
    date:   { el:$('resDate'),   err:$('errDate') },
    time:   { el:$('resTime'),   err:$('errTime') },
    guests: { el:$('resGuests'), err:$('errGuests') }
  };

  function setErr(key, msg){
    var f = fields[key];
    var wrap = f.el.closest('.field');
    if (msg){ wrap.classList.add('bad'); f.err.textContent = msg; }
    else { wrap.classList.remove('bad'); f.err.textContent = ''; }
  }
  function clearAll(){
    Object.keys(fields).forEach(function(k){ setErr(k, ''); });
    $('formAlert').classList.remove('show');
  }

  function digitsOnly(s){ return (s || '').replace(/[^0-9]/g, ''); }

  function validate(){
    var bad = [], msgs = {};
    var name = fields.name.el.value.trim();
    var phone = fields.phone.el.value.trim();
    var email = fields.email.el.value.trim();
    var date = fields.date.el.value;
    var time = fields.time.el.value;
    var guestsRaw = fields.guests.el.value;

    if (name.length < 2){ msgs.name = 'Please tell us your name.'; }
    else if (name.length > 80){ msgs.name = 'That name is a little long. 80 characters max.'; }

    if (!phone){ msgs.phone = 'A phone number helps us confirm quickly.'; }
    else {
      var dg = digitsOnly(phone);
      if (dg.length < 9 || dg.length > 15) msgs.phone = 'Please enter a phone number with 9 to 15 digits.';
    }

    if (!email){ msgs.email = 'Please add an email address.'; }
    else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)){ msgs.email = 'That email address doesn\u2019t look right.'; }

    if (!date){ msgs.date = 'Please choose a date.'; }
    else if (date < todayISO()){ msgs.date = 'That date has already passed. Please pick a future day.'; }

    if (!time){ msgs.time = 'Please choose a time.'; }
    else {
      var dow = 0;
      if (date){
        var p = date.split('-');
        dow = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10)).getDay();
      }
      var win = OPEN[dow];
      if (time < win.o || time > win.c){
        msgs.time = 'We serve ' + fmt12(win.o) + ' to ' + fmt12(win.c) + ' that day.';
      }
    }

    var g = parseInt(guestsRaw, 10);
    if (!guestsRaw || isNaN(g) || String(guestsRaw).indexOf('.') > -1){
      msgs.guests = 'Please enter the number of guests as a whole number.';
    } else if (g < 1){
      msgs.guests = 'At least one guest, please.';
    } else if (g > 40){
      msgs.guests = 'For parties over 40, please call +254 702 455 665 so we can arrange the space.';
    }

    Object.keys(fields).forEach(function(k){
      if (msgs[k]){ bad.push(k); }
      setErr(k, msgs[k] || '');
    });

    if (bad.length){
      var alertBox = $('formAlert');
      $('alertDetail').textContent = bad.length === 1
        ? 'One field needs your attention before we can build the email.'
        : bad.length + ' fields need your attention before we can build the email.';
      alertBox.classList.add('show');
      fields[bad[0]].el.focus();
      alertBox.scrollIntoView({ behavior:'smooth', block:'center' });
      return null;
    }

    $('formAlert').classList.remove('show');
    var notes = $('resNotes').value.trim();
    var occ = $('resOccasion').value;
    return {
      name: name,
      phone: phone,
      email: email,
      date: date,
      time: time,
      guests: String(g),
      notes: notes,
      occasion: occ
    };
  }

  /* ---------- Mailto ---------- */
  function buildMailto(d){
    var subject = 'Reservation Enquiry: ' + d.name + ', ' + fmtDateShort(d.date);
    var lines = [
      'Hello 270\u00B0 Rooftop,',
      '',
      'I would like to enquire about a reservation.',
      '',
      'Name: ' + d.name,
      'Date: ' + fmtDateLong(d.date),
      'Time: ' + fmt12(d.time),
      'Guests: ' + d.guests + (d.guests === '1' ? ' person' : ' people'),
      'Phone: ' + d.phone,
      'Email: ' + d.email
    ];
    if (d.occasion) lines.push('Occasion: ' + d.occasion);
    if (d.notes) lines.push('Special requests: ' + d.notes);
    lines.push('', 'Please let me know if this is possible. Thank you.');
    var body = lines.join('\r\n');
    return 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function waText(d){
    if (!d) return DEFAULT_MSG;
    var s = DEFAULT_MSG + '\n\n' +
      'Name: ' + d.name + '\n' +
      'Date: ' + fmtDateLong(d.date) + '\n' +
      'Time: ' + fmt12(d.time) + '\n' +
      'Guests: ' + d.guests + (d.guests === '1' ? ' person' : ' people');
    if (d.occasion) s += '\nOccasion: ' + d.occasion;
    if (d.notes) s += '\nSpecial requests: ' + d.notes;
    return s;
  }

  /* ---------- Live WhatsApp sync ---------- */
  function currentData(){
    var name = fields.name.el.value.trim();
    var date = fields.date.el.value;
    var time = fields.time.el.value;
    var guests = fields.guests.el.value;
    if (!name && !date && !time) return null;
    return {
      name: name || 'Not given',
      date: date,
      time: time,
      guests: guests || '2',
      notes: $('resNotes').value.trim(),
      occasion: $('resOccasion').value
    };
  }
  function syncWa(){
    var d = currentData();
    var text = waText(d);
    var url = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(text);
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function(a){
      a.href = url;
    });
  }
  ['resName','resDate','resTime','resGuests','resNotes','resOccasion'].forEach(function(id){
    var el = $(id);
    if (el){ el.addEventListener('input', syncWa); el.addEventListener('change', syncWa); }
  });
  syncWa();

  /* ---------- Submit ---------- */
  var form = $('resForm');
  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var data = validate();
    if (!data) return;

    /* keep the WhatsApp buttons in step with what was actually submitted */
    var waUrl = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(waText(data));
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function(a){ a.href = waUrl; });

    var href = buildMailto(data);

    /* hand the details to the confirmation page */
    var q = [];
    q.push('name=' + encodeURIComponent(data.name));
    q.push('date=' + encodeURIComponent(data.date));
    q.push('time=' + encodeURIComponent(data.time));
    q.push('guests=' + encodeURIComponent(data.guests));
    q.push('phone=' + encodeURIComponent(data.phone));
    q.push('email=' + encodeURIComponent(data.email));
    if (data.occasion) q.push('occasion=' + encodeURIComponent(data.occasion));
    if (data.notes) q.push('notes=' + encodeURIComponent(data.notes));

    var btn = form.querySelector('button[type="submit"]');
    if (btn){ btn.disabled = true; btn.textContent = 'Opening your mail app…'; }

    window.location.href = href;
  });

  /* clear the error on a field as soon as it is corrected */
  Object.keys(fields).forEach(function(k){
    var el = fields[k].el;
    var ev = (el.type === 'date' || el.type === 'time' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(ev, function(){
      if (el.closest('.field').classList.contains('bad')) setErr(k, '');
    });
  });
  dateEl.addEventListener('change', function(){
    /* re-check the time against the newly chosen weekday */
    if (fields.time.el.value && fields.time.el.closest('.field').classList.contains('bad')){
      var t = fields.time.el.value;
      var p = dateEl.value.split('-');
      var dow = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10)).getDay();
      var win = OPEN[dow];
      if (t >= win.o && t <= win.c) setErr('time', '');
    }
  });

})();

/* menu disclosures: wine list, breakfast card, beer and cocktail list */
(function(){
  function wire(btnId, panelId, openLabel, closeLabel){
    var btn = document.getElementById(btnId);
    var panel = document.getElementById(panelId);
    if (!btn || !panel) return null;
    var label = btn.querySelector('.disc-toggle-l, .wine-toggle-l');
    function set(open){
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      if (label) label.textContent = open ? closeLabel : openLabel;
    }
    btn.addEventListener('click', function(){
      api.touched = true;
      set(btn.getAttribute('aria-expanded') !== 'true');
    });
    var api = { btn: btn, panel: panel, set: set, touched: false };
    return api;
  }

  var wine  = wire('wineToggle',  'winePanel',  'See the full wine list', 'Hide the wine list');
  var bkfst = wire('bkfstToggle', 'bkfstPanel', 'See the breakfast card', 'Hide the breakfast card');
  wire('barToggle',  'barPanel',  'See the beer and cocktail list', 'Hide the beer and cocktail list');
  wire('cafeToggle', 'cafePanel', 'See the coffee, tea and soft drinks', 'Hide the coffee, tea and soft drinks');
  wire('kitsToggle', 'kitsPanel', 'See the full kitchen card', 'Hide the full kitchen card');

  /* the wine list and the breakfast card open by default on wide viewports only;
     a panel the visitor has opened or closed by hand is left alone */
  var wide = window.matchMedia('(min-width: 900px)');
  function applyDefaults(){
    if (wine && !wine.touched) wine.set(wide.matches);
    if (bkfst && !bkfst.touched) bkfst.set(wide.matches);
  }
  applyDefaults();
  if (wide.addEventListener) wide.addEventListener('change', applyDefaults);
  else if (wide.addListener) wide.addListener(applyDefaults);
})();
