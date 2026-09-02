(function () {
    var SKY_DIR = 'Images/';
    var HOME = { lat: 32.4487, lon: -99.7331 };
    var CACHE_KEY = 'talon-site-weather';
    var CACHE_MS = 20 * 60 * 1000;

    function easterSunday(year) {
        var a = year % 19;
        var b = Math.floor(year / 100);
        var c = year % 100;
        var d = Math.floor(b / 4);
        var e = b % 4;
        var f = Math.floor((b + 8) / 25);
        var g = Math.floor((b - f + 1) / 3);
        var h = (19 * a + b - d - g + 15) % 30;
        var i = Math.floor(c / 4);
        var k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = Math.floor((a + 11 * h + 22 * l) / 451);
        var month = Math.floor((h + l - 7 * m + 114) / 31);
        var day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }

    function sameCalendarDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    }

    function isDaytime(now) {
        var hour = now.getHours();
        return hour >= 6 && hour < 19;
    }

    function holidayFile(now) {
        var month = now.getMonth();
        if (sameCalendarDay(now, easterSunday(now.getFullYear()))) return 'lake easter.jpg';
        if (month === 9) return 'lake halloween.jpg';
        if (month === 10) return 'lake thanksgiving.jpg';
        if (month === 11) return 'lake christmas.jpg';
        if (month === 0) return 'lake new year.jpg';
        if (month === 6) return 'lake fourth.jpg';
        return null;
    }

    function weatherKind(code) {
        var n = Number(code);
        if ([71, 73, 75, 77, 85, 86].indexOf(n) !== -1) return 'snow';
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].indexOf(n) !== -1) return 'rain';
        return 'clear';
    }

    function skyUrl(fileName) {
        return SKY_DIR + encodeURIComponent(fileName);
    }

    function setLakeImage(fileName, fallbacks) {
        var sky = document.querySelector('.lake-background');
        if (!sky) return;
        var queue = [fileName].concat(fallbacks || []);
        var img = new Image();
        var i = 0;
        function tryNext() {
            if (i >= queue.length) return;
            var name = queue[i++];
            img.onload = function () {
                sky.style.backgroundImage = 'url("' + skyUrl(name) + '")';
            };
            img.onerror = tryNext;
            img.src = skyUrl(name);
        }
        tryNext();
    }

    function liteMode() {
        return window.innerWidth <= 768;
    }

    function reducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    var rippleTimer = null;

    function clearWeather() {
        var box = document.getElementById('rain-container');
        if (!box) return;
        box.replaceChildren();
        if (rippleTimer) {
            clearInterval(rippleTimer);
            rippleTimer = null;
        }
    }

    function weatherLayer() {
        var box = document.getElementById('rain-container');
        if (box) {
            box.style.position = 'fixed';
            box.style.inset = '0';
            box.style.zIndex = '4';
            box.style.width = '100%';
            box.style.height = '100%';
            box.style.overflow = 'hidden';
            box.style.pointerEvents = 'none';
        }
        return box;
    }

    function spawnLayer(container, count, className, durationMin, durationSpan) {
        for (var i = 0; i < count; i++) {
            var drop = document.createElement('div');
            var duration = durationMin + Math.random() * durationSpan;
            drop.classList.add(className);
            drop.style.left = (Math.random() * 100) + '%';
            drop.style.top = '-10%';
            drop.style.animationDuration = duration + 's';
            drop.style.animationDelay = (-Math.random() * duration) + 's';
            container.appendChild(drop);
        }
    }

    function startRain() {
        var rainContainer = weatherLayer();
        if (!rainContainer) return;
        clearWeather();
        var rainLite = liteMode();
        var rainDeep = rainLite ? 28 : 70;
        var rainMid = rainLite ? 22 : 55;
        var rainFg = rainLite ? 14 : 36;
        spawnLayer(rainContainer, rainDeep, 'rain-deep-bg', 0.8, 0.7);
        spawnLayer(rainContainer, rainMid, 'rain-mid', 0.5, 0.4);
        spawnLayer(rainContainer, rainFg, 'rain-fg', 0.28, 0.25);
        if (reducedMotion()) return;
        var rippleMs = rainLite ? 280 : 80;
        rippleTimer = setInterval(function () {
            var ripple = document.createElement('div');
            ripple.classList.add('perspective-ripple');
            ripple.style.left = (Math.random() * 100) + '%';
            var topPosition = 50 + (Math.random() * 50);
            ripple.style.top = topPosition + '%';
            var normalizedDepth = (topPosition - 50) / 50;
            var width = 8 + (normalizedDepth * 50);
            var heightFactor = 2.2 + (normalizedDepth * 1.8);
            ripple.style.width = width + 'px';
            ripple.style.height = (width / heightFactor) + 'px';
            if (topPosition < 62) {
                ripple.style.opacity = '0.5';
                ripple.style.filter = 'blur(0.5px)';
            } else {
                ripple.style.opacity = '0.85';
                ripple.style.filter = 'none';
            }
            rainContainer.appendChild(ripple);
            setTimeout(function () { ripple.remove(); }, 650);
        }, rippleMs);
    }

    function startSnow() {
        var rainContainer = weatherLayer();
        if (!rainContainer) return;
        clearWeather();
        if (reducedMotion()) return;
        var rainLite = liteMode();
        var snowDeep = rainLite ? 40 : 90;
        var snowMid = rainLite ? 28 : 70;
        var snowFg = rainLite ? 16 : 40;
        function flakes(count, className, durationMin, durationSpan) {
            for (var i = 0; i < count; i++) {
                var flake = document.createElement('div');
                var duration = durationMin + Math.random() * durationSpan;
                flake.classList.add(className);
                flake.style.left = (Math.random() * 100) + '%';
                flake.style.top = '-8%';
                flake.style.setProperty('--snow-drift', (Math.random() * 48 - 24) + 'px');
                flake.style.animationDuration = duration + 's';
                flake.style.animationDelay = (-Math.random() * duration) + 's';
                rainContainer.appendChild(flake);
            }
        }
        flakes(snowDeep, 'snow-deep-bg', 9, 6);
        flakes(snowMid, 'snow-mid', 6, 5);
        flakes(snowFg, 'snow-fg', 4, 3);
    }

    function holidayKeyFromFile(fileName) {
        var name = String(fileName || '');
        if (name.indexOf('halloween') !== -1) return 'halloween';
        if (name.indexOf('thanksgiving') !== -1) return 'thanksgiving';
        if (name.indexOf('christmas') !== -1) return 'christmas';
        if (name.indexOf('new year') !== -1) return 'new-year';
        if (name.indexOf('fourth') !== -1) return 'fourth';
        if (name.indexOf('easter') !== -1) return 'easter';
        return null;
    }

    var HOLIDAY_KEYS = ['halloween', 'thanksgiving', 'christmas', 'new-year', 'fourth', 'easter'];

    function setCabinHoliday(key) {
        var cabin = document.getElementById('cabin-window');
        var wash = document.getElementById('window-holiday');
        document.documentElement.setAttribute('data-holiday', key || '');
        if (cabin) {
            HOLIDAY_KEYS.forEach(function (name) {
                cabin.classList.toggle('is-' + name, name === key);
            });
        }
        if (wash) {
            HOLIDAY_KEYS.forEach(function (name) {
                wash.classList.toggle('is-' + name, name === key);
            });
            wash.classList.toggle('is-on', Boolean(key));
        }
    }

    function setWindowGlass(kind) {
        var pane = document.getElementById('window-glass');
        if (!pane) return;
        pane.classList.remove('is-rain', 'is-frost', 'is-clear');
        if (kind === 'rain') pane.classList.add('is-rain');
        else if (kind === 'snow') pane.classList.add('is-frost');
        else pane.classList.add('is-clear');
    }

    function applyScene(fileName, weather, extras) {
        var fallbacks = extras || [];
        if (fileName === 'lake easter.jpg') fallbacks = fallbacks.concat(['easter.jpg']);
        if (weather === 'clear' || weather === 'holiday') {
            fallbacks = fallbacks.concat(['lake night.jpg', 'lake day.jpg']);
        }
        setLakeImage(fileName, fallbacks);
        document.documentElement.setAttribute('data-sky-file', fileName);
        document.documentElement.setAttribute('data-sky-weather', weather);
        if (weather === 'rain') {
            setCabinHoliday(null);
            setWindowGlass('rain');
            startRain();
        } else if (weather === 'snow') {
            setCabinHoliday(null);
            setWindowGlass('snow');
            startSnow();
        } else if (weather === 'holiday') {
            var holidayKey = holidayKeyFromFile(fileName);
            setCabinHoliday(holidayKey);
            if (holidayKey === 'christmas') {
                setWindowGlass('snow');
                startSnow();
            } else {
                clearWeather();
            }
        } else {
            setCabinHoliday(null);
            setWindowGlass('clear');
            clearWeather();
        }
    }

    function parseOverride(raw) {
        if (!raw) return null;
        var key = String(raw).toLowerCase().replace(/\s+/g, '-');
        var map = {
            halloween: { file: 'lake halloween.jpg', weather: 'holiday' },
            thanksgiving: { file: 'lake thanksgiving.jpg', weather: 'holiday' },
            christmas: { file: 'lake christmas.jpg', weather: 'holiday' },
            'new-year': { file: 'lake new year.jpg', weather: 'holiday' },
            fourth: { file: 'lake fourth.jpg', weather: 'holiday' },
            easter: { file: 'lake easter.jpg', weather: 'holiday' },
            'rain-day': { file: 'lake rainy day.jpg', weather: 'rain' },
            'rain-night': { file: 'lake rainy night.jpg', weather: 'rain' },
            'snow-day': { file: 'lake snowy day.jpg', weather: 'snow' },
            'snow-night': { file: 'lake snowy night.jpg', weather: 'snow' },
            day: { file: 'lake day.jpg', weather: 'clear' },
            night: { file: 'lake night.jpg', weather: 'clear' }
        };
        return map[key] || null;
    }

    function weatherFile(kind, day) {
        if (kind === 'rain') return day ? 'lake rainy day.jpg' : 'lake rainy night.jpg';
        if (kind === 'snow') return day ? 'lake snowy day.jpg' : 'lake snowy night.jpg';
        return day ? 'lake day.jpg' : 'lake night.jpg';
    }

    function readCache() {
        try {
            var parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (!parsed || typeof parsed.code !== 'number') return null;
            if (Date.now() - parsed.at > CACHE_MS) return null;
            return parsed;
        } catch (err) {
            return null;
        }
    }

    function writeCache(code) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ code: code, at: Date.now() }));
        } catch (err) {}
    }

    function fetchWeather(lat, lon) {
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
            encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) +
            '&current=weather_code';
        return fetch(url).then(function (res) {
            if (!res.ok) throw new Error('weather');
            return res.json();
        }).then(function (data) {
            var code = data && data.current && data.current.weather_code;
            if (typeof code !== 'number') throw new Error('weather');
            writeCache(code);
            return code;
        });
    }

    function locateThenWeather() {
        var cached = readCache();
        if (cached) return Promise.resolve(cached.code);

        return new Promise(function (resolve) {
            var settled = false;
            function done(lat, lon) {
                if (settled) return;
                settled = true;
                fetchWeather(lat, lon).then(resolve).catch(function () { resolve(null); });
            }
            if (!navigator.geolocation) {
                done(HOME.lat, HOME.lon);
                return;
            }
            var timer = setTimeout(function () { done(HOME.lat, HOME.lon); }, 1800);
            navigator.geolocation.getCurrentPosition(function (pos) {
                clearTimeout(timer);
                done(pos.coords.latitude, pos.coords.longitude);
            }, function () {
                clearTimeout(timer);
                done(HOME.lat, HOME.lon);
            }, { timeout: 1600, maximumAge: 30 * 60 * 1000 });
        });
    }

    var SKY_PRESETS = [
        { key: 'day', label: 'Clear day' },
        { key: 'night', label: 'Clear night' },
        { key: 'rain-day', label: 'Rainy day' },
        { key: 'rain-night', label: 'Rainy night' },
        { key: 'snow-day', label: 'Snowy day' },
        { key: 'snow-night', label: 'Snowy night' },
        { key: 'halloween', label: 'Halloween' },
        { key: 'thanksgiving', label: 'Thanksgiving' },
        { key: 'christmas', label: 'Christmas' },
        { key: 'new-year', label: 'New Year' },
        { key: 'fourth', label: 'Fourth of July' },
        { key: 'easter', label: 'Easter' }
    ];

    var PREVIEW_PAGES = [
        { href: 'index.html', label: 'Home' },
        { href: 'music.html', label: 'Music' },
        { href: 'writings.html', label: 'Writings' },
        { href: 'life.html', label: 'The Life' },
        { href: 'login.html', label: 'Parlor door' },
        { href: 'signup.html', label: 'Sign up' },
        { href: 'forum.html', label: 'Parlor' }
    ];

    function currentSkyKey() {
        return new URLSearchParams(location.search).get('sky') || '';
    }

    function skyHref(page, key) {
        return page + '?preview=1&sky=' + encodeURIComponent(key);
    }

    function mountPreviewDock() {
        var params = new URLSearchParams(location.search);
        if (!params.has('preview') && !params.has('sky')) return;
        if (document.getElementById('sky-preview-dock')) return;

        var current = currentSkyKey();
        var dock = document.createElement('div');
        dock.id = 'sky-preview-dock';
        dock.setAttribute('role', 'navigation');
        dock.setAttribute('aria-label', 'Sky preview');

        var select = document.createElement('select');
        select.setAttribute('aria-label', 'Sky');
        SKY_PRESETS.forEach(function (preset) {
            var option = document.createElement('option');
            option.value = preset.key;
            option.textContent = preset.label;
            if (preset.key === current) option.selected = true;
            select.appendChild(option);
        });
        select.addEventListener('change', function () {
            location.href = skyHref(location.pathname.split('/').pop() || 'index.html', select.value);
        });

        var pages = document.createElement('div');
        pages.className = 'sky-preview-pages';
        PREVIEW_PAGES.forEach(function (page) {
            var link = document.createElement('a');
            var file = location.pathname.split('/').pop() || 'index.html';
            link.href = skyHref(page.href, current || 'day');
            link.textContent = page.label;
            if (file === page.href) link.setAttribute('aria-current', 'page');
            pages.appendChild(link);
        });

        var prev = document.createElement('button');
        prev.type = 'button';
        prev.textContent = 'Prev';
        var next = document.createElement('button');
        next.type = 'button';
        next.textContent = 'Next';
        function step(dir) {
            var i = SKY_PRESETS.findIndex(function (p) { return p.key === (select.value || current); });
            if (i < 0) i = 0;
            var nextKey = SKY_PRESETS[(i + dir + SKY_PRESETS.length) % SKY_PRESETS.length].key;
            location.href = skyHref(location.pathname.split('/').pop() || 'index.html', nextKey);
        }
        prev.addEventListener('click', function () { step(-1); });
        next.addEventListener('click', function () { step(1); });

        dock.append(prev, select, next, pages);
        document.body.appendChild(dock);
    }

    function boot() {
        var now = new Date();
        var override = parseOverride(new URLSearchParams(location.search).get('sky'));
        if (override) {
            applyScene(override.file, override.weather);
            mountPreviewDock();
            return;
        }

        var holiday = holidayFile(now);
        if (holiday) {
            applyScene(holiday, 'holiday');
        } else {
            applyScene(weatherFile('clear', isDaytime(now)), 'clear');
        }

        locateThenWeather().then(function (code) {
            if (code == null) return;
            var kind = weatherKind(code);
            if (holidayFile(new Date())) {
                if (holidayKeyFromFile(holidayFile(new Date())) === 'christmas') return;
                setWindowGlass(kind);
                return;
            }
            applyScene(weatherFile(kind, isDaytime(new Date())), kind);
        });
        mountPreviewDock();
    }

    window.easterSunday = easterSunday;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
