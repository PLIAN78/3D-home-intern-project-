import type {Collider,KinematicCharacterController,RigidBody,World} from "@dimforge/rapier3d-compat";
import {groups,LAYER,type Rapier} from "./rapier";
import {approach,clamp,damp,quatFromHeading,type Vec3} from "./math";
import {terrainHeight,LAKE_Y} from "../world/terrain";
export const PLANE_SPOTS={
 trainer:{name:"Vataloo Air C-172",x:-790,z:-180,heading:Math.PI/2,color:"#e6e1cf"},
 scout:{name:"Heron Scout",x:-765,z:-150,heading:Math.PI/2,color:"#bfcbd2"},
};
export type PlaneId=keyof typeof PLANE_SPOTS;
/** The airport's own helicopter: free to fly, parked on the helipad by the control tower. */
export const HELIPAD={id:"airport",name:"Owawa Air helicopter",x:-758,z:-127,heading:Math.PI/2,size:18};
export interface PlaneInput{forward:number;side:number;up:boolean;down:boolean;brake:boolean}
/**
 * Light-aircraft handling, tuned to be easy: W/S move the throttle quickly; on the
 * ground S below idle runs the prop in reverse to back out of a stand; the plane
 * rotates on its own at LIFTOFF (or earlier with Space) and climbs out for a few
 * seconds, so a take-off is just "hold W". Space climbs, Shift descends.
 */
export const PLANE={top:52,reverse:5.5,accel:6.5,brake:10,throttleRate:1.1,liftoff:22,rotate:15,stall:12,climbOut:5};
export class PlaneController{
 readonly body:RigidBody;readonly collider:Collider;private readonly kcc:KinematicCharacterController;
 x:number;y:number;z:number;heading:number;speed=0;throttle=0;pitch=0;roll=0;grounded=true;vel:Vec3={x:0,y:0,z:0};
 /** Seconds of automatic climb left after lifting off. */
 climbOut=0;
 constructor(private R:Rapier,world:World,readonly id:PlaneId){
  const p=PLANE_SPOTS[id];this.x=p.x;this.z=p.z;this.y=terrainHeight(p.x,p.z);this.heading=p.heading;
  this.body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x,this.y+1.2,this.z).setRotation(quatFromHeading(this.heading)));
  this.collider=world.createCollider(R.ColliderDesc.cuboid(3.5,.65,1.1).setCollisionGroups(groups(LAYER.VEHICLE,LAYER.STATIC|LAYER.BREAKABLE|LAYER.VEHICLE|LAYER.PLAYER)),this.body);
  this.kcc=world.createCharacterController(.05);this.kcc.setUp({x:0,y:1,z:0});this.kcc.setSlideEnabled(true);this.kcc.setMaxSlopeClimbAngle(.22);
 }
 place(x:number,z:number,heading=this.heading,y=terrainHeight(x,z)){this.x=x;this.y=y;this.z=z;this.heading=heading;this.speed=0;this.throttle=0;this.vel={x:0,y:0,z:0};this.grounded=y<=terrainHeight(x,z)+.2;this.body.setTranslation({x,y:y+1.2,z},true);this.body.setNextKinematicTranslation({x,y:y+1.2,z});}
 step(dt:number,input:PlaneInput|null){
  // Throttle: below zero (reverse) only on the ground.
  if(input)this.throttle=clamp(this.throttle+input.forward*PLANE.throttleRate*dt,this.grounded?-1:0,1);else this.throttle=0;
  const target=(input?.brake&&this.grounded)?0:this.throttle>=0?this.throttle*PLANE.top:this.throttle*PLANE.reverse;
  const slowing=Math.abs(target)<Math.abs(this.speed)||Math.sign(target)!==Math.sign(this.speed);
  this.speed=approach(this.speed,target,(slowing&&this.grounded?PLANE.brake:PLANE.accel)*dt);
  const turn=input?.side??0;
  // Taxiing backwards steers like a car in reverse.
  this.heading+=turn*(this.grounded?.6:.42)*clamp(Math.abs(this.speed)/10,.15,1)*(this.speed<-.2?-1:1)*dt;
  if(this.grounded&&!input?.brake&&!input?.down&&((this.speed>PLANE.liftoff&&this.throttle>.75)||(input?.up&&this.speed>PLANE.rotate))){this.grounded=false;this.vel.y=2.5;this.climbOut=PLANE.climbOut;}
  this.climbOut=Math.max(0,this.climbOut-dt);
  const wantVy=this.grounded?0:this.speed<PLANE.stall?-7:(this.speed-20)*.1+(input?.up?7:input?.down?-6:0)+(this.climbOut>0&&!input?.down?4:0);
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

