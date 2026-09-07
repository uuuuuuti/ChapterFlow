import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useFocusTrap } from "../../app/focus-trap";
export function Drawer({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
 const ref=useFocusTrap<HTMLDivElement>(onClose);const id=useId();
 return <div className="cf-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="cf-drawer"><header><h2 id={id}>{title}</h2><button aria-label="关闭" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
