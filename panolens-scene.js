'use strict';

(function() {
    var viewer;
    var sceneMap = {};
    var currentSceneId = '0-29';
    var panoramas = {};

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Inicializando PANOLENS...');

        // Crear viewer PANOLENS en el contenedor
        viewer = new PANOLENS.Viewer({
            container: document.getElementById('container'),
            autoHideInfospot: false,
            controlBar: true
        });

        // Construir mapa de escenas desde data.js
        if (window.APP_DATA && window.APP_DATA.scenes) {
            window.APP_DATA.scenes.forEach(function(scene) {
                sceneMap[scene.id] = scene;
            });
        }

        // Crear panoramas para cada escena
        createAllPanoramas();

        // Cargar escena inicial
        loadScene(currentSceneId);

        // Crear lista de botones de escenas
        createSceneList();

        // Detectar cuando entramos/salimos de VR
        viewer.addEventListener('enter-vr', function() {
            console.log('Modo VR activado');
            document.getElementById('vr-info').classList.add('active');
        });

        viewer.addEventListener('exit-vr', function() {
            console.log('Modo VR desactivado');
            document.getElementById('vr-info').classList.remove('active');
        });

        // Habilitar control ORBIT (incluye soporte para Quest 3 automáticamente)
        viewer.enableControl(PANOLENS.CONTROLS.ORBIT);

        console.log('PANOLENS inicializado correctamente');
    }

    // Crear todos los panoramas (uno por escena)
    function createAllPanoramas() {
        console.log('Creando panoramas para todas las escenas...');

        if (window.APP_DATA && window.APP_DATA.scenes) {
            window.APP_DATA.scenes.forEach(function(scene) {
                createPanorama(scene);
            });
        }

        console.log('Total de panoramas creados:', Object.keys(panoramas).length);
    }

    // Crear un panorama individual (cubemap)
    function createPanorama(scene) {
        // URLs de los 6 archivos del cubemap
        // Orden para PANOLELS: [right, left, up, down, front, back]
        var cubemap = [
            'tiles/' + scene.id + '/1/r/0/0.jpg',  // +X (right)
            'tiles/' + scene.id + '/1/l/0/0.jpg',  // -X (left)
            'tiles/' + scene.id + '/1/u/0/0.jpg',  // +Y (up)
            'tiles/' + scene.id + '/1/d/0/0.jpg',  // -Y (down)
            'tiles/' + scene.id + '/1/f/0/0.jpg',  // +Z (front)
            'tiles/' + scene.id + '/1/b/0/0.jpg'   // -Z (back)
        ];

        // Crear CubePanorama
        var panorama = new PANOLENS.CubePanorama(cubemap);
        panorama.sceneId = scene.id;
        panorama.sceneName = scene.name;

        // Agregar hotspots de enlace (transiciones entre escenas)
        if (scene.linkHotspots && scene.linkHotspots.length > 0) {
            scene.linkHotspots.forEach(function(hotspot, index) {
                addHotspot(panorama, hotspot, scene.id);
            });
        }

        // Agregar panorama al viewer
        viewer.add(panorama);

        // Guardar referencia
        panoramas[scene.id] = panorama;

        console.log('Panorama creado:', scene.id, '- Hotspots:', 
            scene.linkHotspots ? scene.linkHotspots.length : 0);
    }

    // Agregar un hotspot a un panorama
    function addHotspot(panorama, hotspot, currentSceneId) {
        var targetScene = sceneMap[hotspot.target];
        if (!targetScene) {
            console.warn('Escena destino no encontrada:', hotspot.target);
            return;
        }

        // Convertir yaw/pitch a posición 3D esférica
        // PANOLELS usa radianes para yaw y pitch
        var yaw = hotspot.yaw;      // ya en radianes
        var pitch = hotspot.pitch;  // ya en radianes

        // Crear infospot (hotspot)
        var infospot = new PANOLENS.Infospot(300, PANOLENS.DataImage.ARROW);
        infospot.position.copy(
            new THREE.Vector3(
                Math.cos(pitch) * Math.sin(yaw),
                Math.sin(pitch),
                -Math.cos(pitch) * Math.cos(yaw)
            ).multiplyScalar(500)
        );

        // Texto que aparece al pasar el mouse
        infospot.setText('Ir a: ' + targetScene.name);

        // Evento click
        infospot.addEventListener('click', function() {
            console.log('Clickeado hotspot, yendo a:', hotspot.target);
            loadScene(hotspot.target);
        });

        // Agregar al panorama
        panorama.add(infospot);
    }

    // Cargar una escena específica
    function loadScene(sceneId) {
        if (!panoramas[sceneId]) {
            console.error('Panorama no encontrado:', sceneId);
            return;
        }

        currentSceneId = sceneId;
        var panorama = panoramas[sceneId];

        // Ir al panorama (con animación suave)
        viewer.setPanorama(panorama);

        // Actualizar UI
        updateSceneUI(sceneId);

        console.log('Escena cargada:', sceneId);
    }

    // Actualizar interfaz (nombre de escena y botón activo)
    function updateSceneUI(sceneId) {
        var scene = sceneMap[sceneId];
        if (!scene) return;

        // Actualizar nombre
        var nameEl = document.getElementById('current-scene');
        if (nameEl) {
            nameEl.textContent = scene.name;
        }

        // Actualizar botón activo
        var buttons = document.querySelectorAll('.scene-btn');
        buttons.forEach(function(btn) {
            btn.classList.remove('active');
            if (btn.getAttribute('data-scene-id') === sceneId) {
                btn.classList.add('active');
            }
        });
    }

    // Crear lista de botones para cambiar de escena
    function createSceneList() {
        var listContainer = document.getElementById('scene-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (window.APP_DATA && window.APP_DATA.scenes) {
            window.APP_DATA.scenes.forEach(function(scene) {
                var btn = document.createElement('button');
                btn.className = 'scene-btn';
                btn.setAttribute('data-scene-id', scene.id);
                btn.textContent = 'Escena ' + scene.name;

                if (scene.id === currentSceneId) {
                    btn.classList.add('active');
                }

                btn.addEventListener('click', function() {
                    loadScene(scene.id);
                });

                listContainer.appendChild(btn);
            });
        }

        console.log('Lista de escenas creada');
    }

    // Exponer funciones globales
    window.VRScene = {
        loadScene: loadScene,
        getCurrentScene: function() { return currentSceneId; },
        getViewer: function() { return viewer; }
    };

    console.log('Script PANOLELS cargado');
})();
