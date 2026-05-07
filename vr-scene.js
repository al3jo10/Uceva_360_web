'use strict';

(function() {
    // Esperar a que A-Frame esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    var currentSceneId = '0-29';
    var sceneMap = {}; // Mapa de ID a datos de escena

    function init() {
        console.log('Inicializando VR Scene...');
        
        // Construir mapa de escenas
        if (window.APP_DATA && window.APP_DATA.scenes) {
            window.APP_DATA.scenes.forEach(function(scene) {
                sceneMap[scene.id] = scene;
            });
        }

        // Cargar activos (imágenes cubemap)
        loadAssets();

        // Aplicar cubemap inicial
        applyCubemap(currentSceneId);

        // Generar hotspots para la escena inicial
        generateHotspots(currentSceneId);

        // Actualizar UI
        updateSceneUI(currentSceneId);

        // Crear lista de escenas
        createSceneList();
    }

    // Cargar activos - con cubemap directo, esto no es necesario
    // pero se mantiene por compatibilidad
    function loadAssets() {
        console.log('Inicializando sistema de cubemap...');
        // Los cubemaps se cargan dinámicamente en applyCubemap()
    }

    // Generar hotspots para una escena
    function generateHotspots(sceneId) {
        var scene = sceneMap[sceneId];
        if (!scene) {
            console.error('Escena no encontrada:', sceneId);
            return;
        }

        // Limpiar hotspots anteriores
        var container = document.getElementById('hotspots-container');
        container.innerHTML = '';

        console.log('Generando hotspots para escena:', sceneId);

        // Generar hotspots de enlace (transiciones entre escenas)
        if (scene.linkHotspots && scene.linkHotspots.length > 0) {
            scene.linkHotspots.forEach(function(hotspot, index) {
                createHotspot(container, hotspot, sceneId, index);
            });
        }
    }

    // Crear un hotspot individual
    function createHotspot(container, hotspot, currentSceneId, index) {
        var targetScene = sceneMap[hotspot.target];
        if (!targetScene) return;

        // Convertir coordenadas esféricas (yaw, pitch) a posición 3D
        // La esfera tiene radio 3 y la cámara está en el centro
        var radius = 3;
        var x = radius * Math.cos(hotspot.pitch) * Math.sin(hotspot.yaw);
        var y = radius * Math.sin(hotspot.pitch);
        var z = -radius * Math.cos(hotspot.pitch) * Math.cos(hotspot.yaw);

        // Crear entidad hotspot
        var hotspotEl = document.createElement('a-entity');
        hotspotEl.setAttribute('class', 'hotspot');
        hotspotEl.setAttribute('position', x + ' ' + y + ' ' + z);
        
        // Crear un cilindro que sea clickeable
        var geometry = document.createElement('a-cylinder');
        geometry.setAttribute('radius', '0.25');
        geometry.setAttribute('height', '0.1');
        geometry.setAttribute('color', '#00AABB');
        geometry.setAttribute('opacity', '0.8');
        
        // Animación de pulso
        geometry.setAttribute('animation', 
            'property: scale; to: 1.2 1.2 1.2; dir: alternate; loop: true; dur: 1000'
        );

        // Texto del hotspot
        var text = document.createElement('a-text');
        text.setAttribute('value', 'Escena ' + targetScene.name);
        text.setAttribute('align', 'center');
        text.setAttribute('position', '0 0.3 0');
        text.setAttribute('scale', '0.5 0.5 0.5');
        text.setAttribute('color', '#FFFFFF');

        // Event listener para cambiar escena
        hotspotEl.addEventListener('click', function() {
            console.log('Clickeado hotspot, yendo a:', hotspot.target);
            changeScene(hotspot.target);
        });

        hotspotEl.appendChild(geometry);
        hotspotEl.appendChild(text);
        container.appendChild(hotspotEl);

        console.log('Hotspot creado:', hotspot.target, 'en posición', x, y, z);
    }

    // Cambiar de escena
    function changeScene(newSceneId) {
        if (!sceneMap[newSceneId]) {
            console.error('Escena no válida:', newSceneId);
            return;
        }

        currentSceneId = newSceneId;

        // Aplicar cubemap
        applyCubemap(newSceneId);

        // Generar nuevos hotspots
        generateHotspots(newSceneId);

        // Actualizar UI
        updateSceneUI(newSceneId);

        console.log('Cambio de escena a:', newSceneId);
    }

    // Aplicar cubemap como material a la caja envolvente
    function applyCubemap(sceneId) {
        // Orden para Three.js CubeTextureLoader: [px, nx, py, ny, pz, nz]
        // Nuestros archivos: r, l, u, d, f, b
        var urls = [
            'tiles/' + sceneId + '/1/r/0/0.jpg',  // +X (right)
            'tiles/' + sceneId + '/1/l/0/0.jpg',  // -X (left)
            'tiles/' + sceneId + '/1/u/0/0.jpg',  // +Y (up)
            'tiles/' + sceneId + '/1/d/0/0.jpg',  // -Y (down)
            'tiles/' + sceneId + '/1/f/0/0.jpg',  // +Z (front)
            'tiles/' + sceneId + '/1/b/0/0.jpg'   // -Z (back)
        ];

        // Obtener elemento de cubemap
        var cubeEntity = document.getElementById('main-cubemap');
        
        // Si ya existe un mesh, removerlo
        if (cubeEntity.object3D && cubeEntity.object3D.children.length > 0) {
            cubeEntity.object3D.children[0].geometry.dispose();
            cubeEntity.object3D.children[0].material.dispose();
            cubeEntity.removeChild(cubeEntity.firstChild);
        }

        // Crear la geometría y material
        var scene = cubeEntity.sceneEl;
        var camera = scene.camera;
        
        // Crear TextureLoader para cargar las imágenes
        var textureLoader = new THREE.TextureLoader();
        
        // Cargar las 6 texturas
        var textures = [];
        var loadedCount = 0;
        
        urls.forEach(function(url, index) {
            textureLoader.load(url, function(texture) {
                texture.encoding = THREE.sRGBColorSpace;
                textures[index] = texture;
                loadedCount++;
                
                // Cuando todas estén cargadas, crear el cubemap
                if (loadedCount === 6) {
                    createCubemapBox(cubeEntity, textures);
                }
            }, undefined, function(error) {
                console.error('Error cargando textura:', url, error);
                // Fallback a preview.jpg si no está disponible
                if (loadedCount + 1 === 6) loadedCount++;
            });
        });
    }

    // Crear la caja de cubemap con las texturas cargadas
    function createCubemapBox(cubeEntity, textures) {
        var geometry = new THREE.BoxGeometry(2000, 2000, 2000);
        
        // Crear material para cada cara del cubo
        var materials = [];
        for (var i = 0; i < 6; i++) {
            if (textures[i]) {
                materials.push(new THREE.MeshBasicMaterial({ 
                    map: textures[i],
                    side: THREE.BackSide
                }));
            } else {
                materials.push(new THREE.MeshBasicMaterial({ color: 0x444444 }));
            }
        }
        
        var mesh = new THREE.Mesh(geometry, materials);
        
        // Agregar al entity
        cubeEntity.setObject3D('mesh', mesh);
        console.log('Cubemap aplicado a escena');
    }

    // Actualizar nombre de escena
    function updateSceneUI(sceneId) {
        var scene = sceneMap[sceneId];
        if (!scene) return;

        var nameEl = document.getElementById('current-scene');
        if (nameEl) {
            nameEl.textContent = scene.name;
        }

        // Actualizar botón activo en la lista
        var buttons = document.querySelectorAll('.scene-btn');
        buttons.forEach(function(btn) {
            btn.classList.remove('active');
            if (btn.getAttribute('data-scene-id') === sceneId) {
                btn.classList.add('active');
            }
        });
    }

    // Crear lista de escenas en la UI
    function createSceneList() {
        var listContainer = document.getElementById('scene-list');
        if (!listContainer) return;

        listContainer.innerHTML = ''; // Limpiar

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
                    changeScene(scene.id);
                });

                listContainer.appendChild(btn);
            });
        }
    }

    // Exponer funciones globales
    window.VRScene = {
        changeScene: changeScene,
        getCurrentScene: function() { return currentSceneId; }
    };

    console.log('VR Scene inicializado correctamente');
})();
