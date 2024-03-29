// https://stackoverflow.com/questions/36921947/read-a-server-side-file-using-javascript
// https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Sending_and_Receiving_Binary_Data

async function loadfile(path) {
    return new Promise(function(resolve, reject) {
        const req = new XMLHttpRequest();
        req.open("GET", path, true);
        req.responseType = "arraybuffer";
        req.onload = function() {
            const arrayBuffer = req.response;
            if (arrayBuffer) {
                const byteArray = new Uint8Array(arrayBuffer);
                resolve(byteArray);
            }
        };
        req.onerror = function() {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        }
        req.send(null); 
    })
}

// Image cache = [[IsLoaded][Texture], [IsLoaded][Texture], [IsLoaded][Texture]]
function loadImageFromLocal(gl, path) {
    var tex = gl.createTexture();
    //gl.bindTexture(gl.TEXTURE_2D,tex);

    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
    // Sets to blue as default
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
    gl.texImage2D(
        gl.TEXTURE_2D,
        level,
        internalFormat,
        width,
        height,
        border,
        srcFormat,
        srcType,
        pixel,
    );

    var img = new Image();
    img.src=path;
    img.onload = function()
    {
        gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, null);    // clear afterwards
    }

    return tex;
}

function parsePrimitive(gltf, bin, primitive) {
    var accessor = gltf["accessors"][parseInt(primitive)];
    var bufferView = gltf["bufferViews"][parseInt(accessor["bufferView"])];
    var offset = parseInt(bufferView["byteOffset"]);
    var byte_length = parseInt(bufferView["byteLength"]);
    var byte_array = new Uint8Array(bin.slice(offset, offset + byte_length));
    const data_view = new DataView(byte_array.buffer);
    var data_array;
    switch(accessor["componentType"]) {
        case 5126:  // Float
            data_array = new Float32Array(byte_length / 4);
            for(let i = 0; i < data_array.length; i++) {
                data_array[i] = data_view.getFloat32(i * 4, true);
            }
            break;
        case 5123:  // Unsigned short
            data_array = new Uint16Array(byte_length / 2);
            for(let i = 0; i < data_array.length; i++) {
                data_array[i] = data_view.getUint16(i * 2, true);
            }
            break;
        default:
            throw new Error("Tried to read an invalid componentType of value " + accessor["componentType"] + "!");
    }

    return data_array;
}

async function gltf_to_data(gl, dir, gltfname) {
    return new Promise(async function(resolve, reject) {
        file_promise = fetch(dir + "/" + gltfname + ".gltf");
        file_promise.then(file => {
            gltf_promise = file.json();
            gltf_promise.then(gltf => {
                bin_promise = loadfile(dir + "/" + gltf["buffers"][0]["uri"]);
                bin_promise.then(bin => {

                    var material_count = gltf["materials"].length;
                    var material_array = Array.apply(null, Array(material_count)).map(function (x, i) { return [null]; })
                    for(var material_index = 0; material_index<material_count; material_index++) {
                        var material = gltf["materials"][material_index];
                        var base_color_texture_index = parseInt(material["pbrMetallicRoughness"]["baseColorTexture"]["index"]);
                        var texture_source_index = gltf["textures"][base_color_texture_index]["source"];
                        var image_name = gltf["images"][texture_source_index]["uri"];
                        material_array[material_index] = loadImageFromLocal(gl, dir + "/" + image_name);
                    }

                    var mesh_count = gltf["meshes"][0]["primitives"].length;
                    var mesh_array = [];
                    for(var mesh_index = 0; mesh_index<mesh_count; mesh_index++) {
                        const prims = gltf["meshes"][0]["primitives"][mesh_index];
                        const positionArray = parsePrimitive(gltf, bin, prims["attributes"]["POSITION"]);
                        const normalArray = parsePrimitive(gltf, bin, prims["attributes"]["NORMAL"]);
                        const texcoordArray = parsePrimitive(gltf, bin, prims["attributes"]["TEXCOORD_0"]);
                        const indicesArray = parsePrimitive(gltf, bin, prims["indices"]);
                        const material_index = parseInt(prims["material"]);

                        const vertex_data_length = 8;
                        buffer = new Array(indicesArray.length)
                        for(var i=0; i<indicesArray.length; i++) {
                            let index = indicesArray[i];
                            buffer[i] = [
                                [positionArray[3*index + 0]],
                                [positionArray[3*index + 1]],
                                [positionArray[3*index + 2]],
                                [normalArray[3*index + 0]],
                                [normalArray[3*index + 1]],
                                [normalArray[3*index + 2]],
                                [texcoordArray[2*index + 0]],
                                [texcoordArray[2*index + 1]]
                            ]
                        }
                        buffer = buffer.flat();

                        var gl_buffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, gl_buffer);
                        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(buffer), gl.STATIC_DRAW);

                        mesh_array.push([gl_buffer, material_index, buffer.length / 8]);
                    }

                    resolve({
                        "meshes": mesh_array,
                        "materials": material_array
                    });
                })  
            })
        })     
    });
}