import { buildProgramFromSources, loadShadersFromScripts, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, lookAt, flatten, translate, mult, inverse, normalMatrix, scale, vec4, add } from "../../libs/MV.js";
import {modelView, loadMatrix, multMatrix, multRotationY, multScale, multTranslation, multRotationX, pushMatrix, popMatrix, multRotationZ} from "../../libs/stack.js";
import * as CYLINDER from '../../libs/cylinder.js';
import * as SPHERE from '../../libs/sphere.js';
import * as CUBE from '../../libs/cube.js';
import * as PYRAMID from '../../libs/pyramid.js';
import * as TORUS from '../../libs/torus.js';

/** @type WebGLRenderingContext */
let gl;

let time = 0;
let speed = 1/60;
let mode;               // Drawing mode (gl.LINES or gl.TRIANGLES)

const GRID_SIZE = 30;
const TILE_SIZE = 1;
const TILE_THICKNESS = 0.1;

const WHEEL_SIZE = 0.66;
const WHEEL_CONNECTION_LENGTH = 4;
const WHEEL_CONNECTION_SIZE = WHEEL_SIZE/2;

const MAIN_BODY_LENGTH = WHEEL_SIZE * 12;

const VP_DISTANCE = 15;
const ZOOM = 0.5;
const MOV = 0.1;
const gravitationalAcceleration = -9.8;

var uColor;
var view = 4;
var zoom = VP_DISTANCE;
var movement = 0;
var cannonRotation = 0;
var cannonElevation = 0;
var radians = 0;
var wheelRotation = 0;
var cannonEndX, cannonEndY, cannonEndZ;
var wc;
var startingPos, velocity;

let projectiles = [];
let cannonMV;



function setup(shaders)
{
    let canvas = document.getElementById("gl-canvas");
    let aspect = canvas.width / canvas.height;

    gl = setupWebGL(canvas);

    let program = buildProgramFromSources(gl, shaders["shader.vert"], shaders["shader.frag"]);

    let mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-3*VP_DISTANCE,3*VP_DISTANCE);

    let mV = loadMatrix(lookAt([1,1,1], [0,0,0], [0,1,0]));



    mode = gl.TRIANGLES;

    uColor = gl.getUniformLocation(program, "uColor");

    resize_canvas();
    window.addEventListener("resize", resize_canvas);

    document.onkeydown = function(event) {
        switch(event.key) {
            case 'w':
                if(cannonElevation < 20)
                    cannonElevation += 1;
                    cannonEndY = Math.sin(cannonElevation) * (WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/2) + ((WHEEL_CONNECTION_LENGTH * 1.5)/2) + WHEEL_CONNECTION_SIZE);
                    break;
            case 'W':
                if(mode == gl.TRIANGLES)
                    mode = gl.LINES;
                break;
            case 's':
                if(cannonElevation > 0)
                    cannonElevation -= 1;
                    cannonEndY = Math.sin(cannonElevation) * (WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/2) + ((WHEEL_CONNECTION_LENGTH * 1.5)/2) + WHEEL_CONNECTION_SIZE);
                break;
            case 'S':
                if(mode == gl.LINES)
                    mode = gl.TRIANGLES;
                break;
            case 'a':
                cannonRotation += 1;
                cannonEndX = Math.cos(cannonRotation) * (WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/2) + ((WHEEL_CONNECTION_LENGTH * 1.5)/2) + WHEEL_CONNECTION_SIZE);
                cannonEndZ = Math.sin(cannonRotation) * (WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/2) + ((WHEEL_CONNECTION_LENGTH * 1.5)/2) + WHEEL_CONNECTION_SIZE);
                break;
            case 'd':
                cannonRotation -= 1;
                cannonEndX = Math.cos(cannonRotation) * (WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/2) + ((WHEEL_CONNECTION_LENGTH * 1.5)/2) + WHEEL_CONNECTION_SIZE);
                cannonEndZ = Math.sin(cannonRotation) * (WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/2) + ((WHEEL_CONNECTION_LENGTH * 1.5)/2) + WHEEL_CONNECTION_SIZE);
                break;
            case ' ':
                Shoot();
                break;
            case 'ArrowUp':
                if(movement < GRID_SIZE/2 - (MAIN_BODY_LENGTH/2)){
                    movement += MOV;
                    radians += MOV/(WHEEL_SIZE/2);
                    wheelRotation += (radians * 180) / Math.PI;
                }
                break;
            case 'ArrowDown':
                if(movement > -(GRID_SIZE/2 - MAIN_BODY_LENGTH/2)){
                    movement -= MOV;
                    radians -= MOV/(WHEEL_SIZE/2);
                    wheelRotation -= (radians * 180) / Math.PI;
                }
                break;
            case '1':
                view = 1;
                break;
            case '2':
                view = 2;
                break;
            case '3':
                view = 3;
                break;
            case '4':
                view = 4;
                break;
            case '+':
                if(zoom > 1){
                    zoom -= ZOOM;
                    mProjection = ortho(-zoom*aspect,zoom*aspect, -zoom, zoom,-3*zoom,3*zoom);
                }
                break;
            case '-':
                zoom += ZOOM;
                mProjection = ortho(-zoom*aspect,zoom*aspect, -zoom, zoom,-3*zoom,3*zoom);
                break;
        }
    }

    gl.clearColor(1.0, 0.9, 0.8, 1.0);
    SPHERE.init(gl);
    CUBE.init(gl);
    CYLINDER.init(gl);
    PYRAMID.init(gl);
    TORUS.init(gl);
    gl.enable(gl.DEPTH_TEST);   // Enables Z-buffer depth test
    
    window.requestAnimationFrame(render);


    function resize_canvas(event)
    {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        aspect = canvas.width / canvas.height;

        gl.viewport(0,0,canvas.width, canvas.height);
        mProjection = ortho(-zoom*aspect, zoom*aspect, -zoom, zoom,-3*zoom,3*zoom);
    }

    function uploadUniforms(color)
    {
        gl.uniform3fv(uColor, color);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(modelView()));
    }

    function Tile(color){
        uploadUniforms(color);

        CUBE.draw(gl, program, mode);
    }

    function Floor(){
        for(var i = 0; i < GRID_SIZE; i++){
            for(var j = 0; j < GRID_SIZE; j++){
                pushMatrix();
                multTranslation([-(GRID_SIZE/2) + j, -0.1, -(GRID_SIZE/2) + i]);                
                multScale([TILE_SIZE, TILE_THICKNESS, TILE_SIZE]);
                if((i+j)%2 == 0){
                    Tile([0,0,0]);
                } else {
                    Tile([1,0.6,0.2]);
                }
                popMatrix();
            }
        }
    }

    function tank()
    {
        pushMatrix();
            Chassis();
        popMatrix();

        pushMatrix();
            Body();
        popMatrix();

            CannonMount();
    }

    function Chassis(){
        pushMatrix();
            PairOfWheels();
        popMatrix();

        pushMatrix();
            multTranslation([WHEEL_SIZE*2, 0, 0]);
            PairOfWheels();
        popMatrix();

        pushMatrix();
            multTranslation([-WHEEL_SIZE*2, 0, 0]);
            PairOfWheels();
        popMatrix();

        pushMatrix();
            multTranslation([-WHEEL_SIZE*4, 0, 0]);
            PairOfWheels();
        popMatrix();

        pushMatrix();
            multTranslation([WHEEL_SIZE*4, 0, 0]);
            PairOfWheels();
        popMatrix();

        pushMatrix();
            multTranslation([WHEEL_SIZE*6, WHEEL_SIZE, 0]);
            UpperWheels();
        popMatrix();

        pushMatrix();
            multTranslation([-WHEEL_SIZE*6, WHEEL_SIZE, 0]);
            UpperWheels();
        popMatrix();

            ChassisBase([0, 0, 1]);

    }

    function Wheel(color){
        multTranslation([0, WHEEL_SIZE/2, 0]);

        multRotationZ(wheelRotation);
        multRotationX(90);

        multScale([WHEEL_SIZE, WHEEL_SIZE, WHEEL_SIZE]);

        uploadUniforms(color);

        TORUS.draw(gl, program, mode);
    }

    function WheelConnection(color){
        multTranslation([0, WHEEL_SIZE/2, 0]);

        multRotationZ(wheelRotation);
        multRotationX(90);

        multScale([WHEEL_CONNECTION_SIZE, WHEEL_CONNECTION_LENGTH, WHEEL_CONNECTION_SIZE]);

        uploadUniforms(color);

        CYLINDER.draw(gl, program, mode);
    }

    function ChassisBase(color){
        multTranslation([0, (3*WHEEL_SIZE/4), 0]);

        multRotationZ(90);
        multRotationY(90);

        multScale([WHEEL_CONNECTION_SIZE, WHEEL_SIZE*8, 0.01]);

        uploadUniforms(color);

        CYLINDER.draw(gl, program, mode);
    }

    function PairOfWheels(){

        pushMatrix();
        WheelConnection([0, 1, 0]);
        popMatrix();

        pushMatrix();
        multTranslation([0, 0, -WHEEL_CONNECTION_LENGTH/2]);
        Wheel([0, 0.3, 0]);
        popMatrix();

        multTranslation([0, 0, WHEEL_CONNECTION_LENGTH/2]);
        Wheel([0, 0.3, 0]);
    }

    function UpperWheels(){
        pushMatrix();
        multTranslation([0, 0, -WHEEL_CONNECTION_LENGTH/2]);
        Wheel([0, 0.3, 0]);
        popMatrix();

        multTranslation([0, 0, WHEEL_CONNECTION_LENGTH/2]);
        Wheel([0, 0.3, 0]);
    }

    function Body(){
        pushMatrix();
            MainBody([0, 0.1, 0]);
        popMatrix();

        pushMatrix();
            UpperBody([0, 0.15, 0]);
        popMatrix();

        pushMatrix();
            BodyLid([0, 0.1, 0]);
        popMatrix();

            LowerCannon([0.1, 0.2, 0.05]);
    }

    function MainBody(color){
        
        multTranslation([0, (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/16), 0]);

        multScale([MAIN_BODY_LENGTH, MAIN_BODY_LENGTH/8, WHEEL_CONNECTION_LENGTH - (WHEEL_SIZE/2.5)]);

        uploadUniforms(color);

        CUBE.draw(gl, program, mode);
    }

    function UpperBody(color){
        
        multTranslation([0, (3*WHEEL_SIZE/4) + (5*MAIN_BODY_LENGTH/32), 0]);

        multScale([MAIN_BODY_LENGTH/1.5, MAIN_BODY_LENGTH/16, WHEEL_CONNECTION_LENGTH - (WHEEL_SIZE/2.5)]);

        uploadUniforms(color);

        CUBE.draw(gl, program, mode);
    }

    function BodyLid(color){
        multTranslation([MAIN_BODY_LENGTH/4,
            (3*WHEEL_SIZE/4) + (6*MAIN_BODY_LENGTH/32) + (WHEEL_SIZE/16),
            -WHEEL_SIZE*1.5])

        multScale([WHEEL_CONNECTION_LENGTH/4, WHEEL_SIZE/8, WHEEL_CONNECTION_LENGTH/4]);

        uploadUniforms(color);

        CYLINDER.draw(gl, program, mode);
    }

    function LowerCannon(color){
        multTranslation([-WHEEL_SIZE, (3*WHEEL_SIZE/4) + (7*MAIN_BODY_LENGTH/32), 0]);

        multScale([WHEEL_CONNECTION_LENGTH - WHEEL_SIZE, MAIN_BODY_LENGTH/16, WHEEL_CONNECTION_LENGTH - WHEEL_SIZE]);

        uploadUniforms(color);

        CYLINDER.draw(gl, program, mode);
    }
    
    function CannonMount(){

        pushMatrix();
            CannonDome([1, 0.3, 0]);
        popMatrix();

            multTranslation([-WHEEL_SIZE, -((3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + WHEEL_CONNECTION_SIZE), 0]);
            multRotationY(cannonRotation);
            multTranslation([WHEEL_SIZE, (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + WHEEL_CONNECTION_SIZE, 0]);

            multTranslation([-WHEEL_SIZE, (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + WHEEL_CONNECTION_SIZE, 0]);   
            multRotationZ(cannonElevation);
            multTranslation([WHEEL_SIZE, -((3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + WHEEL_CONNECTION_SIZE), 0]);

        pushMatrix();
            Cannon([0.1, 0.3, 0.1]);
        popMatrix();

        pushMatrix();
            UpperCannon([0, 0.5, 0]);
        popMatrix();

        pushMatrix();
            CannonEnd([0, 0.5, 0]);
        popMatrix();

            CannonLid([0, 0.1, 0]);
    }

    function CannonDome(color){
        
        multTranslation([-WHEEL_SIZE, (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4), 0]);

        multRotationY(cannonRotation);
        multRotationZ(cannonElevation);

        multScale([WHEEL_CONNECTION_LENGTH/2, WHEEL_CONNECTION_LENGTH/2, WHEEL_CONNECTION_LENGTH/2]);

        uploadUniforms(color);

        SPHERE.draw(gl, program, mode);
    }

    function Cannon(color){
        multTranslation([WHEEL_CONNECTION_LENGTH/2,
            (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + WHEEL_CONNECTION_SIZE,
            0]);  
        
        multRotationZ(90);

        multScale([WHEEL_CONNECTION_SIZE, WHEEL_CONNECTION_LENGTH*1.5, WHEEL_CONNECTION_SIZE]);

        uploadUniforms(color);

        CYLINDER.draw(gl, program, mode);        
    }

    function UpperCannon(color){
        multTranslation([-(WHEEL_SIZE + (WHEEL_CONNECTION_LENGTH/6)),
            (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + (WHEEL_CONNECTION_LENGTH/4) - (MAIN_BODY_LENGTH/32),
            0]);
        
        multScale([WHEEL_CONNECTION_LENGTH/3, MAIN_BODY_LENGTH/16, WHEEL_CONNECTION_LENGTH/2]);

        uploadUniforms(color);

        CUBE.draw(gl, program, mode);
    }

    function CannonEnd(color){
        cannonEndX = (WHEEL_CONNECTION_LENGTH*1.5) + (WHEEL_CONNECTION_SIZE/2) - (WHEEL_CONNECTION_LENGTH/4);
        cannonEndY = (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + WHEEL_CONNECTION_SIZE;
        cannonEndZ = 0;

        multTranslation([cannonEndX, cannonEndY, cannonEndZ]);
        
        multScale([WHEEL_CONNECTION_SIZE, WHEEL_CONNECTION_SIZE * 1.5, WHEEL_CONNECTION_SIZE*2]);

        uploadUniforms(color);
        
        cannonMV = modelView();

        CUBE.draw(gl, program, mode);
    }

    function CannonLid(color){
        multTranslation([-((WHEEL_SIZE/2) + (WHEEL_CONNECTION_LENGTH/4)),
            (3*WHEEL_SIZE/4) + (MAIN_BODY_LENGTH/4) + (WHEEL_CONNECTION_LENGTH/4) + (WHEEL_SIZE/16),
            -WHEEL_SIZE/2])

        multScale([WHEEL_CONNECTION_LENGTH/4, WHEEL_SIZE/8, WHEEL_CONNECTION_LENGTH/4]);

        uploadUniforms(color);

        CYLINDER.draw(gl, program, mode);
    }

    function Shoot(){
        wc = mult(inverse(mV), cannonMV);

        startingPos = mult(wc, vec4(0, 0, 0, 1));
        velocity = mult(normalMatrix(wc), vec4(5, 0, 0, 0));

        projectiles.push({pos : startingPos, vel : velocity});
    }

    function Projectile(){
        for(let i = 0; i < projectiles.length; i++){

            if(projectiles[i].pos[1] > WHEEL_CONNECTION_SIZE/2){
                projectiles[i].pos = add(projectiles[i].pos, add(scale(time, projectiles[i].vel), vec4(0, ((gravitationalAcceleration*(time*time))/2), 0, 0)));
                projectiles[i].vel = add(projectiles[i].vel, vec4(0, gravitationalAcceleration * time, 0, 0));
                
            pushMatrix();
                multTranslation([projectiles[i].pos[0], projectiles[i].pos[1], projectiles[i].pos[2]]);
                Bullet([1, 0, 0]);
            popMatrix();

            } else {
                projectiles.splice(i, 1);
            }
        }
    }

    function Bullet(color){

        multScale([WHEEL_CONNECTION_SIZE/2, WHEEL_CONNECTION_SIZE/2, WHEEL_CONNECTION_SIZE/2]);

        uploadUniforms(color);

        SPHERE.draw(gl, program, mode);
    }

    function render()
    {
        time = speed;

        window.requestAnimationFrame(render);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        gl.useProgram(program);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));

        switch(view){
            case 1: //vista de frente
                loadMatrix(lookAt([zoom, 0, 0], [0, 0, 0], [0, 1, 0]));
                mV = lookAt([zoom, 0, 0], [0, 0, 0], [0, 1, 0]);
                break;
            case 2: //vista de topo
                loadMatrix(lookAt([0, zoom, 0], [0, 0, 0], [-1, 0, 0]));
                mV = lookAt([0, zoom, 0], [0, 0, 0], [-1, 0, 0]);
                break;
            case 3: //vista lateral
                loadMatrix(lookAt([0,0,zoom], [0,0,0], [0,1,0]));
                mV = lookAt([0,0,zoom], [0,0,0], [0,1,0]);
                break;
            case 4: //vista axonometrica
                loadMatrix(lookAt([1,1,1], [0,0,0], [0,1,0]));
                mV = lookAt([1,1,1], [0,0,0], [0,1,0]);
                break;
        }

        pushMatrix();
            Floor();
        popMatrix();
        
        pushMatrix();
            multTranslation([movement, TILE_THICKNESS/1.25, 0]);
            tank();
        popMatrix();

            Projectile();
    }
}

const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))