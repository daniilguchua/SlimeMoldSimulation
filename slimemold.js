/*
 * slimemold.js
 */

window.addEventListener("load", () => {
  const slimeCanvas   = document.getElementById("slimeCanvas");
  const pushCircle    = document.getElementById("pushCircle");

  
  // Control Panel references

  const particleCountSlider   = document.getElementById("particleCount");
  const particleCountValue    = document.getElementById("particleCountValue");
  const applyParticleCountBtn = document.getElementById("applyParticleCountBtn");

  const sensorAngleSlider     = document.getElementById("sensorAngle");
  const sensorAngleValue      = document.getElementById("sensorAngleValue");

  const stepSizeSlider        = document.getElementById("stepSize");
  const stepSizeValue         = document.getElementById("stepSizeValue");

  const depositAmountSlider   = document.getElementById("depositAmount");
  const depositAmountValue    = document.getElementById("depositAmountValue");

  const decayFactorSlider     = document.getElementById("decayFactor");
  const decayFactorValue      = document.getElementById("decayFactorValue");

  const simulationSpeedSlider = document.getElementById("simulationSpeed");
  const simulationSpeedValue  = document.getElementById("simulationSpeedValue");

  const pheromoneAttractionSlider = document.getElementById("pheromoneAttraction");
  const pheromoneAttractionValue  = document.getElementById("pheromoneAttractionValue");

  const glowIntensitySlider   = document.getElementById("glowIntensity");
  const glowIntensityValue    = document.getElementById("glowIntensityValue");

  const hueSpeedSlider        = document.getElementById("hueSpeed");
  const hueSpeedValue         = document.getElementById("hueSpeedValue");

  const foodScarcityToggle    = document.getElementById("foodScarcityToggle");

  const ResetBtn              = document.getElementById("ResetBtn");
  const randomizeBtn          = document.getElementById("randomizeBtn");


  // THREE.js references
  let scene, camera, renderer;
  let particles, pheromoneTexture;
  let canvasWidth= 0, canvasHeight= 0;

  let originalValues= {};


  // Simulation params
  const params = {
    particleCount: parseInt(particleCountSlider.value),
    sensorAngle: parseFloat(sensorAngleSlider.value),
    stepSize: parseFloat(stepSizeSlider.value),
    depositAmount: parseFloat(depositAmountSlider.value),
    decayFactor: parseFloat(decayFactorSlider.value),
    simulationSpeed: parseFloat(simulationSpeedSlider.value),
    pheromoneAttraction: parseFloat(pheromoneAttractionSlider.value),
    foodScarcity: false,

    glowIntensity: parseFloat(glowIntensitySlider.value),
    hueSpeed: parseFloat(hueSpeedSlider.value),

    mouseDown: false,
    mousePos: new THREE.Vector2(-9999, -9999),

    lastTime: 0,
    delta:   0
  };


  // Push parameters
  const pushR   = 40; 
  const pushStr = 90;  

  initThreeJS();
  animate(0);

  /*
   * 1) Initialize THREE.js
   */
  function initThreeJS(){
    fitCanvasToElement(slimeCanvas);
    canvasWidth  = slimeCanvas.width;
    canvasHeight = slimeCanvas.height;

    scene = new THREE.Scene();

    camera= new THREE.OrthographicCamera(0, canvasWidth, 0, canvasHeight, 0.1, 1000);
    camera.position.z= 1;

    renderer= new THREE.WebGLRenderer({
      canvas: slimeCanvas,
      antialias: true,
      alpha: true
    });
    renderer.setSize(canvasWidth, canvasHeight, false);

    initPheromoneTexture();
    createParticles();
    setupMouseInteraction();

    updatePushCircle();
  }

  function fitCanvasToElement(canvas){
    const rect= canvas.getBoundingClientRect();
    canvas.width= rect.width;
    canvas.height= rect.height;
  }

  /*
   * 2) Pheromone Texture
   */
  function initPheromoneTexture(){
    const size= canvasWidth* canvasHeight;
    const data= new Float32Array(size*4).fill(0);
    pheromoneTexture= new THREE.DataTexture(
      data, canvasWidth, canvasHeight, THREE.RGBAFormat, THREE.FloatType
    );
    pheromoneTexture.needsUpdate= true;
  }


  /*
   * 3) Particles
   */
  function createParticles(){
    if(particles) scene.remove(particles);

    const geometry= new THREE.BufferGeometry();
    const positions= new Float32Array(params.particleCount*3);
    const angles   = new Float32Array(params.particleCount);
    const velocities= new Float32Array(params.particleCount);

    const cx= canvasWidth /2;
    const cy= canvasHeight/2;

    const maxR = 50;

    for (let i = 0; i < params.particleCount; i++) {
      // Random position within a circle
      const randAngle  = 2.0 * Math.PI * Math.random();
      const randRadius = maxR * Math.sqrt(Math.random());
  
      positions[i * 3]     = cx + randRadius * Math.cos(randAngle);
      positions[i * 3 + 1] = cy + randRadius * Math.sin(randAngle);
      positions[i * 3 + 2] = 0;
  
      // Random initial direction
      angles[i] = Math.random() * 2.0 * Math.PI;
  
      // Random velocity
      velocities[i] = 0.3 + Math.random() * 0.7;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions,3));
    geometry.setAttribute("angle",    new THREE.BufferAttribute(angles,1));
    geometry.setAttribute("velocity", new THREE.BufferAttribute(velocities,1));

    const material= new THREE.ShaderMaterial({
      uniforms:{
        time: { value: 0 },
        pheromoneMap: { value: pheromoneTexture },
        resolution: { value: new THREE.Vector2(canvasWidth, canvasHeight)},
        mousePos: { value: params.mousePos },
        glowIntensity: { value: params.glowIntensity },
        hueSpeed: { value: params.hueSpeed }
      },
      vertexShader: `
        uniform float time;
        uniform vec2 resolution;
        uniform vec2 mousePos;
        uniform float glowIntensity;
        uniform float hueSpeed;

        attribute float angle;
        attribute float velocity;

        varying vec2 vUv;
        varying float vAngle;

        void main(){
          vUv= vec2(position.x/resolution.x, position.y/resolution.y);
          vAngle= angle;
          gl_PointSize= 3.0+(velocity*2.0);
          gl_Position= projectionMatrix* modelViewMatrix* vec4(position,1.0);
        }
      `,

      fragmentShader: `
        uniform sampler2D pheromoneMap;
        uniform vec2 resolution;
        uniform vec2 mousePos;
        uniform float time;
        uniform float glowIntensity;
        uniform float hueSpeed;

        varying vec2 vUv;
        varying float vAngle;

        vec3 hsv2rgb(vec3 c){
          vec3 rgb= clamp(
            abs(mod(c.x*6.0+ vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,
            0.0,1.0
          );
          rgb= rgb*rgb*(3.0-2.0*rgb);
          return c.z* mix(vec3(1.0), rgb,c.y);
        }

        void main(){
          vec2 coord= gl_PointCoord*2.0 -1.0;
          float dist= length(coord);
          float alpha= smoothstep(0.9,0.6, dist);

          float p= texture2D(pheromoneMap, vUv).r;
          float hue= 0.2 + hueSpeed* time + (p*0.003);
          hue= fract(hue);

          vec3 trailColor= hsv2rgb(vec3(hue,1.0,1.0))* glowIntensity;

          float cHue= fract(0.14+ 0.03* time + vAngle/6.28);
          vec3 coreColor= hsv2rgb(vec3(cHue,0.4,1.0));

          vec3 finalColor= mix(coreColor, trailColor, 0.7);

          gl_FragColor= vec4(finalColor, alpha*0.95);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    particles= new THREE.Points(geometry, material);
    scene.add(particles);
  }

  /*
   * 4) Mouse Interaction
   */

  function setupMouseInteraction(){
    const canvas= renderer.domElement;

    canvas.addEventListener("mousedown",(e)=>{
      params.mouseDown= true;
      updateMousePos(e);
      pushCircle.style.display= "block";
    });

    canvas.addEventListener("mousemove",(e)=>{
      if(params.mouseDown){
        updateMousePos(e);
      }
    });

    canvas.addEventListener("mouseup",(e)=>{
      params.mouseDown= false;
      pushCircle.style.display= "none";
      params.mousePos.set(-9999, -9999);
    });

    function updateMousePos(ev){
      const rect= canvas.getBoundingClientRect();
      const scaleX= canvas.width / rect.width;
      const scaleY= canvas.height / rect.height;
      let x= (ev.clientX - rect.left)* scaleX;
      let y= (ev.clientY - rect.top )* scaleY;

      params.mousePos.set(x,y);

      pushCircle.style.left= (ev.clientX - rect.left)+"px";
      pushCircle.style.top= (ev.clientY - rect.top )+"px";
    }
  }

  function updatePushCircle(){
    pushCircle.style.width ="80px";
    pushCircle.style.height="80px";
  }

  /*
   * 5) Animation Loop
   */
  function animate(timestamp){
    requestAnimationFrame(animate);

    params.delta= timestamp - params.lastTime;
    params.lastTime= timestamp;

    for(let i=0; i< params.simulationSpeed; i++){
      updateParticles();
      decayPheromones();
    }

    if(particles && particles.material.uniforms.time){
      particles.material.uniforms.time.value= timestamp*0.001;
    }
    renderer.render(scene, camera);
  }

  /*
   * 6) Update Particles
   */
  function updateParticles(){
    const pos= particles.geometry.attributes.position.array;
    const ang= particles.geometry.attributes.angle.array;
    const vel= particles.geometry.attributes.velocity.array;

    const sensorDist= 15.0;
    const turnSpeed= 0.08 * params.pheromoneAttraction;

    for(let i=0; i< params.particleCount; i++){
      let x= pos[i*3];
      let y= pos[i*3+1];
      let angle= ang[i];

      if(params.mouseDown){
        let dx= x- params.mousePos.x;
        let dy= y- params.mousePos.y;
        let dist= Math.sqrt(dx*dx + dy*dy);

        let factor= pushStr*(1.0 - dist/pushR);
        if(factor<0) factor=0;
        if(factor>0){
          let dir= Math.atan2(dy, dx);
          x+= Math.cos(dir)* factor;
          y+= Math.sin(dir)* factor;
        }
      }

      const angleRad= params.sensorAngle*Math.PI/180.0;
      const cVal= readPheromone(
        x+ Math.cos(angle)* sensorDist,
        y+ Math.sin(angle)* sensorDist
      );
      const lVal= readPheromone(
        x+ Math.cos(angle+ angleRad)* sensorDist,
        y+ Math.sin(angle+ angleRad)* sensorDist
      );
      const rVal= readPheromone(
        x+ Math.cos(angle- angleRad)* sensorDist,
        y+ Math.sin(angle- angleRad)* sensorDist
      );

      if(cVal >= lVal && cVal >= rVal){
        angle += (Math.random()-0.5)*0.1;
      } else if(lVal > rVal){
        angle += turnSpeed;
      } else {
        angle -= turnSpeed;
      }

      x+= Math.cos(angle)* params.stepSize;
      y+= Math.sin(angle)* params.stepSize;

      if(x<0) x+= canvasWidth;
      if(x>=canvasWidth)  x-= canvasWidth;
      if(y<0) y+= canvasHeight;
      if(y>=canvasHeight) y-= canvasHeight;

      drawTrail(pos[i*3], pos[i*3+1], x,y, params.depositAmount*(0.5+ vel[i]));

      pos[i*3]  = x;
      pos[i*3+1]= y;
      ang[i]    = angle;
    }

    particles.geometry.attributes.position.needsUpdate= true;
    particles.geometry.attributes.angle.needsUpdate= true;
  }

  function drawTrail(x1,y1,x2,y2, amt){
    const steps=5;
    for(let s=0; s<= steps; s++){
      let t= s/ steps;
      let xx= x1+ (x2- x1)* t;
      let yy= y1+ (y2- y1)* t;
      deposit(xx, yy, amt/(steps+1));
    }
  }
  function deposit(x,y, val){
    let nx= Math.floor((x+canvasWidth)%canvasWidth);
    let ny= Math.floor((y+canvasHeight)%canvasHeight);
    let idx= (ny*canvasWidth+ nx)*4;
    pheromoneTexture.image.data[idx]+= val;
    if(pheromoneTexture.image.data[idx]>1000){
      pheromoneTexture.image.data[idx]=1000;
    }
  }
  function decayPheromones(){
    const data= pheromoneTexture.image.data;
    for(let i=0; i<data.length; i+=4){
      data[i]*= params.decayFactor;
      data[i+1]= data[i]*0.3;
      data[i+2]= data[i]*0.1;
      if(data[i]<0.01) data[i]=0;
    }
    pheromoneTexture.needsUpdate= true;
  }
  function readPheromone(x,y){
    let nx= Math.floor((x+canvasWidth)%canvasWidth);
    let ny= Math.floor((y+canvasHeight)%canvasHeight);
    return pheromoneTexture.image.data[(ny*canvasWidth+ nx)*4]|| 0;
  }

  /*
   * 7) UI Listeners
   */
  particleCountSlider.oninput= (e)=>{
    particleCountValue.textContent= e.target.value;
  };
  applyParticleCountBtn.onclick= ()=>{
    params.particleCount= parseInt(particleCountSlider.value);
    initPheromoneTexture();
    createParticles();
  };
  sensorAngleSlider.oninput= (e)=>{
    params.sensorAngle= parseFloat(e.target.value);
    sensorAngleValue.textContent= e.target.value+"°";
  };
  stepSizeSlider.oninput= (e)=>{
    params.stepSize= parseFloat(e.target.value);
    stepSizeValue.textContent= e.target.value;
  };
  depositAmountSlider.oninput= (e)=>{
    params.depositAmount= parseFloat(e.target.value);
    depositAmountValue.textContent= e.target.value;
  };
  decayFactorSlider.oninput= (e)=>{
    params.decayFactor= parseFloat(e.target.value);
    decayFactorValue.textContent= e.target.value;
  };
  simulationSpeedSlider.oninput= (e)=>{
    params.simulationSpeed= parseFloat(e.target.value);
    simulationSpeedValue.textContent= e.target.value+"x";
  };
  pheromoneAttractionSlider.oninput= (e)=>{
    params.pheromoneAttraction= parseFloat(e.target.value);
    pheromoneAttractionValue.textContent= e.target.value;
  };
  glowIntensitySlider.oninput= (e)=>{
    params.glowIntensity= parseFloat(e.target.value);
    glowIntensityValue.textContent= e.target.value;
  };
  hueSpeedSlider.oninput= (e)=>{
    params.hueSpeed= parseFloat(e.target.value);
    hueSpeedValue.textContent= e.target.value;
  };

  foodScarcityToggle.onchange= (e)=>{
    params.foodScarcity= e.target.checked;
    if(params.foodScarcity){
  
      originalValues= {
        stepSize: params.stepSize,
        depositAmount: params.depositAmount,
        decayFactor: params.decayFactor,
        sensorAngle: params.sensorAngle,
        pheromoneAttraction: params.pheromoneAttraction
      };
 
      params.stepSize= 1.0;
      params.depositAmount= 30;
      params.decayFactor= 0.96;
      params.sensorAngle= 75;
      params.pheromoneAttraction= 4.2;

      stepSizeValue.textContent= params.stepSize;
      depositAmountValue.textContent= params.depositAmount;
      decayFactorValue.textContent= params.decayFactor;
      sensorAngleValue.textContent= params.sensorAngle+"°";
      pheromoneAttractionValue.textContent= params.pheromoneAttraction;

      stepSizeSlider.value= params.stepSize;
      depositAmountSlider.value= params.depositAmount;
      decayFactorSlider.value= params.decayFactor;
      sensorAngleSlider.value= params.sensorAngle;
      pheromoneAttractionSlider.value= params.pheromoneAttraction;

      stepSizeSlider.disabled= true;
      depositAmountSlider.disabled= true;
      decayFactorSlider.disabled= true;
      sensorAngleSlider.disabled= true;
      pheromoneAttractionSlider.disabled= true;
    } else {
  
      stepSizeSlider.disabled= false;
      depositAmountSlider.disabled= false;
      decayFactorSlider.disabled= false;
      sensorAngleSlider.disabled= false;
      pheromoneAttractionSlider.disabled= false;

      params.stepSize= originalValues.stepSize;
      params.depositAmount= originalValues.depositAmount;
      params.decayFactor= originalValues.decayFactor;
      params.sensorAngle= originalValues.sensorAngle;
      params.pheromoneAttraction= originalValues.pheromoneAttraction;

      stepSizeValue.textContent= params.stepSize;
      depositAmountValue.textContent= params.depositAmount;
      decayFactorValue.textContent= params.decayFactor;
      sensorAngleValue.textContent= params.sensorAngle+"°";
      pheromoneAttractionValue.textContent= params.pheromoneAttraction;

      stepSizeSlider.value= params.stepSize;
      depositAmountSlider.value= params.depositAmount;
      decayFactorSlider.value= params.decayFactor;
      sensorAngleSlider.value= params.sensorAngle;
      pheromoneAttractionSlider.value= params.pheromoneAttraction;
    }
  };

  ResetBtn.onclick= ()=>{
    initPheromoneTexture();
    createParticles();
  };

  randomizeBtn.onclick= ()=>{
    if(!particles) return;

    initPheromoneTexture();

    const pos= particles.geometry.attributes.position.array;
    const ang= particles.geometry.attributes.angle.array;
    for(let i=0; i< params.particleCount; i++){
      pos[i*3]   = Math.random()* canvasWidth;
      pos[i*3+1] = Math.random()* canvasHeight;
      ang[i]     = Math.random()* Math.PI*2;
    }
    particles.geometry.attributes.position.needsUpdate= true;
    particles.geometry.attributes.angle.needsUpdate= true;
  };

  window.addEventListener("resize", ()=>{
    fitCanvasToElement(slimeCanvas);
    canvasWidth= slimeCanvas.width;
    canvasHeight= slimeCanvas.height;
    camera.left=0; 
    camera.right= canvasWidth;
    camera.top=0; 
    camera.bottom= canvasHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasWidth, canvasHeight, false);

    if(particles && particles.material.uniforms.resolution){
      particles.material.uniforms.resolution.value.set(canvasWidth, canvasHeight);
    }
    initPheromoneTexture();
    createParticles();
    updatePushCircle();
  });
});
