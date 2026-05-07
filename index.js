/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

  // Create action element (placeholder) to appear next to the close (X) button.
  // This button is a visual placeholder for a future action and does nothing for now.
  var actionWrapper = document.createElement('div');
  actionWrapper.classList.add('info-hotspot-action-wrapper');
  var actionIcon = document.createElement('div');
  actionIcon.classList.add('info-hotspot-action-icon');
  actionIcon.setAttribute('title', 'Acción');
  actionWrapper.appendChild(actionIcon);

  // Create second action element (red) to sit between the blue action and the close (X).
  var actionRedWrapper = document.createElement('div');
  actionRedWrapper.classList.add('info-hotspot-action2-wrapper');
  var actionRedIcon = document.createElement('div');
  actionRedIcon.classList.add('info-hotspot-action2-icon');
  actionRedIcon.setAttribute('title', 'Acción roja');
  actionRedWrapper.appendChild(actionRedIcon);

  // Construct header element.
  header.appendChild(iconWrapper);
  header.appendChild(titleWrapper);
  // Place the action buttons to the left of the close button so they appear "al lado de la X".
  // Order: blue action, red action, close (so red sits between blue and close).
  header.appendChild(actionWrapper);
  header.appendChild(actionRedWrapper);
  header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

  // ========================================
  // HYBRID: MARZIPANO + A-FRAME VR (Meta Quest 3)
  // ========================================
  var vrButton = document.getElementById('vrButton');
  var vrStatus = document.getElementById('vrStatus');
  var vrScene = document.getElementById('vr-scene');
  var vrSky = document.getElementById('vr-sky');
  var aframeScene = document.querySelector('a-scene');
  var isVRMode = false;
  var currentSceneData = null;
  var panoramaCanvas = null;

  // Detectar soporte WebXR
  function initializeVR() {
    if (!navigator.xr) {
      console.log('WebXR no disponible');
      return;
    }

    navigator.xr.isSessionSupported('immersive-vr').then(function(supported) {
      if (supported) {
        vrButton.style.display = 'block';
        console.log('✓ WebXR immersive-vr soportado');
      } else {
        console.log('✗ VR inmersivo no soportado');
      }
    }).catch(function(err) {
      console.error('Error verificando WebXR:', err);
    });
  }

  // Obtener canvas de Marzipano y convertir a imagen
  function getCameraScreenshot() {
    try {
      var canvas = panoElement.querySelector('canvas');
      if (canvas) {
        // Obtener datos del canvas
        return canvas.toDataURL('image/jpeg', 0.9);
      }
      return null;
    } catch (err) {
      console.error('Error capturando canvas:', err);
      return null;
    }
  }

  // Obtener URL de imagen de máxima calidad
  function getSceneImageUrl() {
    if (!currentSceneData) {
      return 'tiles/0-29/preview.jpg';
    }

    // Preferir preview.jpg por defecto (más fiable que screenshot para proyecciones)
    var urlPrefix = 'tiles';
    var previewUrl = urlPrefix + '/' + currentSceneData.id + '/preview.jpg';
    return previewUrl;
  }

  // Intentar cargar un cubemap (6 caras) desde la estructura de tiles
  function loadCubemap(sceneId, onSuccess, onError) {
    // Faces en orden para THREE.CubeTexture: +X, -X, +Y, -Y, +Z, -Z
    var faces = ['r', 'l', 'u', 'd', 'f', 'b'];
    var urls = faces.map(function(f) {
      return 'tiles/' + sceneId + '/1/' + f + '/0/0.jpg';
    });

    // Asegurarnos que THREE esté disponible (A-Frame lo incluye)
    if (typeof window.THREE === 'undefined' || typeof window.THREE.CubeTextureLoader === 'undefined') {
      console.log('THREE no disponible para cubemap');
      if (onError) onError(new Error('THREE no disponible'));
      return;
    }

    var loader = new window.THREE.CubeTextureLoader();
    loader.load(urls, function(texture) {
      if (window.THREE && window.THREE.sRGBEncoding) texture.encoding = window.THREE.sRGBEncoding;
      console.log('Cubemap cargado correctamente');
      if (onSuccess) onSuccess(texture);
    }, undefined, function(err) {
      console.warn('No se pudo cargar cubemap, fallback a preview', err);
      if (onError) onError(err);
    });
  }

  // Actualizar imagen en VR cuando cambia escena
  function updateVRImage() {
    if (!isVRMode || !vrSky) {
      return;
    }

    try {
      var imageUrl = getSceneImageUrl();
      // Preferir cubemap si está disponible
      if (currentSceneData && window.THREE) {
        loadCubemap(currentSceneData.id, function(texture) {
          try {
            if (aframeScene && aframeScene.object3D) {
              aframeScene.object3D.background = texture;
            }
            console.log('Imagen VR actualizada (cubemap)');
          } catch (e) {
            vrSky.setAttribute('src', imageUrl);
            console.warn('Error aplicando cubemap en update:', e);
          }
        }, function() {
          vrSky.setAttribute('src', imageUrl);
          console.log('Imagen VR actualizada (preview)');
        });
      } else {
        vrSky.setAttribute('src', imageUrl);
        console.log('Imagen VR actualizada (preview)');
      }
    } catch (err) {
      console.error('Error actualizando imagen VR:', err);
    }
  }

  // Hook en switchScene para actualizar VR automáticamente
  var originalSwitchScene = switchScene;
  switchScene = function(scene) {
    currentSceneData = scene.data;
    originalSwitchScene.call(this, scene);
    
    // Si estamos en VR, actualizar la imagen
    if (isVRMode) {
      // Esperar un frame para que Marzipano renderice
      setTimeout(updateVRImage, 100);
    }
  };

  // Asegurar que tenemos referencia a la escena inicial
  if (!currentSceneData && scenes && scenes[0]) {
    currentSceneData = scenes[0].data;
  }

  // Evento del botón VR
  vrButton.addEventListener('click', function() {
    if (isVRMode) {
      exitVR();
    } else {
      enterVR();
    }
  });

  // Entrar en VR
  function enterVR() {
    if (!aframeScene) {
      alert('A-Frame no cargado correctamente');
      return;
    }

    try {
      // Detener autorotate
      stopAutorotate();

      // Obtener imagen actual en máxima calidad
      var imageUrl = getSceneImageUrl();
      console.log('Entrando en VR con imagen:', imageUrl);

      if (!imageUrl) {
        alert('No se pudo obtener imagen de la escena');
        return;
      }

      // Intentar cargar cubemap de alta resolución; si falla, usar preview
      var usedCubemap = false;
      if (currentSceneData && window.THREE) {
        loadCubemap(currentSceneData.id, function(texture) {
          try {
            // Aplicar como background de la escena A-Frame (Three.js)
            if (aframeScene && aframeScene.object3D) {
              aframeScene.object3D.background = texture;
              console.log('Fondo A-Frame: cubemap aplicado');
            }
            // Mostrar escena de A-Frame
            vrScene.classList.add('active');
            usedCubemap = true;
          } catch (e) {
            console.warn('Error aplicando cubemap:', e);
            // fallback abajo
          }
        }, function() {
          // onError: fallback a preview
          console.log('Fallback: usando preview.jpg');
          vrSky.setAttribute('src', imageUrl);
          vrScene.classList.add('active');
        });
      } else {
        // Mostrar escena de A-Frame con preview
        vrSky.setAttribute('src', imageUrl);
        vrScene.classList.add('active');
      }

      // Ocultar UI de Marzipano
      document.body.classList.add('vr-mode');

      // Actualizar botón
      vrButton.textContent = '❌ Salir de VR';
      vrButton.classList.add('vr-active');
      vrStatus.style.display = 'block';
      vrStatus.textContent = '🥽 VR Activo - Mueve tu cabeza';
      isVRMode = true;

      // Habilitar hotspots y mostrar controles
      enableVRHotspots();
      showVRControls();

      // Mostrar lista de escenas en VR
      sceneListElement.classList.add('enabled');

      // Esperar a que A-Frame esté listo
      if (aframeScene.hasLoaded) {
        console.log('A-Frame listo, solicitando VR...');
        requestVRFromAFrame();
      } else {
        aframeScene.addEventListener('loaded', function() {
          console.log('A-Frame loaded, solicitando VR...');
          requestVRFromAFrame();
        }, { once: true });
      }
    } catch (err) {
      console.error('Error entrando en VR:', err);
      vrStatus.textContent = '❌ Error: ' + err.message;
      isVRMode = false;
    }
  }

  // Solicitar sesión VR a A-Frame
  function requestVRFromAFrame() {
    if (!aframeScene) return;

    if (aframeScene.is('vr-mode')) {
      console.log('Ya en VR mode');
      return;
    }

    try {
      // Usar el método de A-Frame para entrar en VR
      if (aframeScene.enterVR) {
        console.log('Llamando enterVR...');
        aframeScene.enterVR();
      } else {
        console.log('enterVR no disponible');
      }
    } catch (err) {
      console.error('Error en requestVRFromAFrame:', err);
    }
  }

  // Salir de VR
  function exitVR() {
    try {
      // Salir de VR en A-Frame
      if (aframeScene && aframeScene.is && aframeScene.is('vr-mode')) {
        if (aframeScene.exitVR) {
          aframeScene.exitVR();
        }
      }

      // Ocultar escena de A-Frame
      vrScene.classList.remove('active');

      // Mostrar UI de Marzipano
      document.body.classList.remove('vr-mode');

      // Actualizar botón
      vrButton.textContent = '📱 Entrar en VR';
      vrButton.classList.remove('vr-active');
      vrStatus.style.display = 'none';
      vrStatus.textContent = '';
      isVRMode = false;

      // Ocultar controles VR
      hideVRControls();

      // Reiniciar autorotate
      startAutorotate();
      
      console.log('Salido de VR');
    } catch (err) {
      console.error('Error saliendo de VR:', err);
    }
  }

  // Escuchar evento de salida de VR
  if (aframeScene) {
    aframeScene.addEventListener('exit-vr', function() {
      console.log('Usuario salió de VR');
      exitVR();
    });
  }

  // Mejorar UI cuando está en VR
  var originalStyle = document.createElement('style');
  originalStyle.textContent = `
    body.vr-mode #titleBar,
    body.vr-mode #autorotateToggle,
    body.vr-mode #fullscreenToggle,
    body.vr-mode #sceneListToggle,
    body.vr-mode .viewControlButton {
      display: none !important;
    }
    body.vr-mode #pano {
      display: none !important;
    }
    /* Mantener lista de escenas visible en VR pero optimizada */
    body.vr-mode #sceneList {
      position: fixed !important;
      bottom: 80px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      right: auto !important;
      max-height: 200px !important;
      overflow-y: auto !important;
      background: rgba(0, 0, 0, 0.85) !important;
      border-radius: 10px !important;
      padding: 10px !important;
      width: 90% !important;
      max-width: 600px !important;
    }
    body.vr-mode #sceneList .scenes {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 5px !important;
      justify-content: center !important;
    }
    body.vr-mode #sceneList .scene {
      padding: 8px 12px !important;
      background: #667eea !important;
      border-radius: 5px !important;
      color: white !important;
      font-size: 12px !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
    }
    body.vr-mode #sceneList .scene:hover,
    body.vr-mode #sceneList .scene.current {
      background: #764ba2 !important;
      transform: scale(1.1) !important;
    }
    #vr-controls {
      background: rgba(0, 0, 0, 0.8) !important;
      padding: 15px 20px !important;
      border-radius: 10px !important;
    }
  `;
  document.head.appendChild(originalStyle);

  // Hacer que los hotspots funcionen en VR
  function enableVRHotspots() {
    var hotspots = document.querySelectorAll('.scene');
    hotspots.forEach(function(hotspot) {
      // Remover listeners antiguos
      var clone = hotspot.cloneNode(true);
      hotspot.parentNode.replaceChild(clone, hotspot);

      // Agregar listener nuevo que funcione en VR
      clone.addEventListener('click', function(e) {
        e.preventDefault();
        var sceneId = clone.getAttribute('data-id');
        console.log('VR: Cambiando a escena:', sceneId);
        
        // Encontrar y cambiar a la escena
        for (var i = 0; i < scenes.length; i++) {
          if (scenes[i].data.id === sceneId) {
            switchScene(scenes[i]);
            break;
          }
        }
      }, true);
    });
  }

  // Mostrar UI de VR
  var vrControls = document.getElementById('vr-controls');
  function showVRControls() {
    if (vrControls) {
      vrControls.style.display = 'block';
    }
  }

  function hideVRControls() {
    if (vrControls) {
      vrControls.style.display = 'none';
    }
  }

  // Inicializar VR
  initializeVR();

})();
