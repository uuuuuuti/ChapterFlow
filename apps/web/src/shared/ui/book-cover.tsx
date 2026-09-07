import { BookOpen } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { projectCoverBlob, projectCoverUrl } from "../api/projects";
import type { Project } from "../api/types";
export function BookCover({project}: {project: Project}) {
 const direct = projectCoverUrl(project);
 const [local, setLocal] = useState<string|null>(null);
 useEffect(() => { let live=true; if(project.cover && !direct) void projectCoverBlob(project).then(url => {if(live)setLocal(url);}).catch(()=>{}); return ()=>{live=false;}; },[project,direct]);
 const src=direct??local;
 const hue=[...project.id].reduce((n,c)=>n+c.charCodeAt(0),0)%70+185;
 return <div className="cf-cover" style={{"--cover-hue":hue} as CSSProperties}>{src?<img src={src} alt={`${project.title}封面`} style={{objectPosition:`${(project.cover?.crop.x??.5)*100}% ${(project.cover?.crop.y??.5)*100}%`,transform:`scale(${project.cover?.crop.zoom??1})`}}/>:<><BookOpen size={28}/><strong>{project.title}</strong><small>CHAPTERFLOW</small><span className="cf-cover-line"/></>}</div>;
}
export function bookStatus(phase:Project["phase"]){return phase==="complete"?"已完结":phase==="writing"||phase==="revising"?"创作中":"准备中";}
