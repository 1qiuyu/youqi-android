function createColorWheel(onChange) {
  const canvas = document.getElementById('color-wheel');
  const marker = document.getElementById('wheel-marker');
  const brightness = document.getElementById('color-brightness');
  const hexField = document.getElementById('color-hex');
  const swatch = document.getElementById('selected-color');
  const size = canvas.width, center = size / 2, radius = center - 5;
  let hue = 0, saturation = 0, value = 1, pointerId = null;

  function hsvToRgb(h, s, v) {
    const sector = h / 60, chroma = v * s;
    const x = chroma * (1 - Math.abs(sector % 2 - 1));
    const groups = [[chroma,x,0],[x,chroma,0],[0,chroma,x],
      [0,x,chroma],[x,0,chroma],[chroma,0,x]];
    return groups[Math.floor(sector) % 6].map(c => Math.round((c + v - chroma) * 255));
  }

  function currentHex() {
    return '#' + hsvToRgb(hue,saturation,value).map(c => c.toString(16).padStart(2,'0')).join('');
  }

  // Display the full-brightness circle so black selections do not hide its colors.
  const context = canvas.getContext('2d');
  const image = context.createImageData(size,size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + .5 - center, dy = y + .5 - center;
      const distance = Math.hypot(dx,dy);
      if (distance > radius) continue;
      const h = (Math.atan2(dy,dx) * 180 / Math.PI + 360) % 360;
      image.data.set([...hsvToRgb(h,distance/radius,1),255],(y*size+x)*4);
    }
  }
  context.putImageData(image,0,0);

  function syncControls() {
    const radians = hue * Math.PI / 180;
    marker.style.left = (center + Math.cos(radians) * saturation * radius) + 'px';
    marker.style.top = (center + Math.sin(radians) * saturation * radius) + 'px';
    const hex = currentHex();
    brightness.value = Math.round(value * 100);
    hexField.value = hex;
    hexField.setCustomValidity('');
    swatch.style.backgroundColor = hex;
    canvas.setAttribute('aria-label',`颜色色圈，当前 ${hex}`);
  }

  function set(hex) {
    const [r,g,b] = hex.slice(1).match(/../g).map(c => parseInt(c,16) / 255);
    const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max-min;
    value = max;
    saturation = max === 0 ? 0 : delta / max;
    if (delta) {
      hue = (max===r ? (g-b)/delta : max===g ? (b-r)/delta+2 : (r-g)/delta+4)*60;
      hue = (hue + 360) % 360;
    }
    syncControls();
  }

  function commit() {
    syncControls();
    onChange(currentHex());
  }

  function pick(event) {
    const box = canvas.getBoundingClientRect();
    const dx = (event.clientX-box.left)*size/box.width-center;
    const dy = (event.clientY-box.top)*size/box.height-center;
    hue = (Math.atan2(dy,dx)*180/Math.PI+360)%360;
    saturation = Math.min(1,Math.hypot(dx,dy)/radius);
    // Choosing from the circle should produce a visible color after selecting black.
    if (value === 0) value = 1;
    commit();
  }

  canvas.addEventListener('pointerdown',event=>{
    if (event.button !== 0 || pointerId !== null) return;
    pointerId=event.pointerId;
    canvas.setPointerCapture(pointerId);
    canvas.focus(); pick(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if (event.pointerId===pointerId) pick(event);
  });
  function release(event) {
    if (event.pointerId !== pointerId) return;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
  }
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',()=>{pointerId=null;});
  canvas.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key==='ArrowLeft') hue=(hue+355)%360;
    if (event.key==='ArrowRight') hue=(hue+5)%360;
    if (event.key==='ArrowUp') saturation=Math.min(1,saturation+.03);
    if (event.key==='ArrowDown') saturation=Math.max(0,saturation-.03);
    commit();
  });
  brightness.addEventListener('input',()=>{value=Number(brightness.value)/100;commit();});
  hexField.addEventListener('input',()=>{
    if (/^#[0-9a-f]{6}$/i.test(hexField.value)) {
      const hex = hexField.value.toLowerCase();
      set(hex); onChange(hex);
    } else hexField.setCustomValidity('请输入 # 加六位十六进制颜色，例如 #f6d5a0');
  });
  hexField.addEventListener('change',()=>{
    if (!/^#[0-9a-f]{6}$/i.test(hexField.value)) syncControls();
  });
  return {set};
}
