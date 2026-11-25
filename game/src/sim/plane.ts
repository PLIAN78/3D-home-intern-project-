import type {Collider,KinematicCharacterController,RigidBody,World} from "@dimforge/rapier3d-compat";
import {groups,LAYER,type Rapier} from "./rapier";
import {approach,clamp,damp,quatFromHeading,type Vec3} from "./math";
import {terrainHeight,LAKE_Y} from "../world/terrain";
export const PLANE_SPOTS={
 trainer:{name:"Vataloo Air C-172",x:-790,z:-180,heading:Math.PI/2,color:"#e6e1cf"},
 scout:{name:"Heron Scout",x:-765,z:-150,heading:Math.PI/2,color:"#bfcbd2"},
};
export type PlaneId=keyof typeof PLANE_SPOTS;
export interface PlaneInput{forward:number;side:number;up:boolean;down:boolean;brake:boolean}
export class PlaneController{
 readonly body:RigidBody;readonly collider:Collider;private readonly kcc:KinematicCharacterController;
 x:number;y:number;z:number;heading:number;speed=0;throttle=0;pitch=0;roll=0;grounded=true;vel:Vec3={x:0,y:0,z:0};
 constructor(private R:Rapier,world:World,readonly id:PlaneId){
  const p=PLANE_SPOTS[id];this.x=p.x;this.z=p.z;this.y=terrainHeight(p.x,p.z);this.heading=p.heading;
  this.body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x,this.y+1.2,this.z).setRotation(quatFromHeading(this.heading)));
  this.collider=world.createCollider(R.ColliderDesc.cuboid(3.5,.65,1.1).setCollisionGroups(groups(LAYER.VEHICLE,LAYER.STATIC|LAYER.BREAKABLE|LAYER.VEHICLE|LAYER.PLAYER)),this.body);
  this.kcc=world.createCharacterController(.05);this.kcc.setUp({x:0,y:1,z:0});this.kcc.setSlideEnabled(true);this.kcc.setMaxSlopeClimbAngle(.22);
 }
 place(x:number,z:number,heading=this.heading,y=terrainHeight(x,z)){this.x=x;this.y=y;this.z=z;this.heading=heading;this.speed=0;this.throttle=0;this.vel={x:0,y:0,z:0};this.grounded=y<=terrainHeight(x,z)+.2;this.body.setTranslation({x,y:y+1.2,z},true);this.body.setNextKinematicTranslation({x,y:y+1.2,z});}
 step(dt:number,input:PlaneInput|null){
  if(input){this.throttle=clamp(this.throttle+input.forward*.6*dt,0,1);}else this.throttle=0;
  const target=(input?.brake&&this.grounded)?0:this.throttle*52;
  this.speed=approach(this.speed,target,(input?.brake?12:4.8)*dt);
  const turn=input?.side??0;
  this.heading+=turn*(this.grounded?.6:.42)*clamp(this.speed/10,.15,1)*dt;
  if(this.grounded&&this.speed>21&&input?.up&&!input?.brake){this.grounded=false;this.vel.y=1.5;}
  const wantVy=this.grounded?0:this.speed<18?-9:(this.speed-28)*.12+(input?.up?8:input?.down?-7:0);
  this.vel.y=approach(this.vel.y,wantVy,4.5*dt);
  this.pitch+=(clamp(Math.atan2(this.vel.y,Math.max(10,this.speed)),-.35,.35)-this.pitch)*damp(3,dt);
  this.roll+=((this.grounded?0:-turn*.48)-this.roll)*damp(3,dt);
  this.vel.x=Math.cos(this.heading)*this.speed;this.vel.z=Math.sin(this.heading)*this.speed;
  const desired={x:this.vel.x*dt,y:this.vel.y*dt,z:this.vel.z*dt};
  this.kcc.computeColliderMovement(this.collider,desired,this.R.QueryFilterFlags.EXCLUDE_SENSORS,groups(LAYER.VEHICLE,LAYER.STATIC|LAYER.BREAKABLE|LAYER.VEHICLE));
  const m=this.kcc.computedMovement();
  if(Math.hypot(desired.x,desired.z)>.01&&Math.hypot(m.x,m.z)<Math.hypot(desired.x,desired.z)*.5){this.speed*=.7;this.throttle=0;}
  this.x=clamp(this.x+m.x,-980,980);this.z=clamp(this.z+m.z,-980,980);this.y+=m.y;
  const ground=terrainHeight(this.x,this.z);
  if(this.y<=ground+.03&&this.vel.y<=0){this.y=ground;this.vel.y=0;this.grounded=true;}
  if(ground<LAKE_Y-.5&&this.y<LAKE_Y+.3){const p=PLANE_SPOTS[this.id];this.place(p.x,p.z,p.heading);}
  this.body.setNextKinematicTranslation({x:this.x,y:this.y+1.2,z:this.z});this.body.setNextKinematicRotation(quatFromHeading(this.heading));
 }
}

