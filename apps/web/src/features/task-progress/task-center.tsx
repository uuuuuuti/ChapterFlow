import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { getProjectRuns, getRunDetail, controlRun } from "../../shared/api/automation";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote } from "../../shared/ui";
import type { RunActionRequest } from "../../shared/api/types";
const states:Record<string,string>={pending:"准备中",running:"正在创作",awaiting_user:"等待你确认",paused:"已暂停",failed_recoverable:"等待重试",failed:"处理失败",cancelled:"已取消",completed:"已完成"};
export function TaskCenter({projectId}:{projectId:string}){
 const query=useQuery({queryKey:queryKeys.runs(projectId),queryFn:({signal})=>getProjectRuns(projectId,signal),refetchInterval:2000});
 return <>{query.isError?<ErrorNote error={query.error}/>:null}{query.isPending?<p>正在读取任务…</p>:null}{query.data?.length===0?<p>还没有创作任务。你可以随时开始手工写作。</p>:null}{query.data?.slice(0,20).map(run=><TaskResult key={run.id} projectId={projectId} runId={run.id}/>)}</>;
}
export function TaskResult({projectId,runId,onAccepted}:{projectId:string;runId:string;onAccepted?:()=>void}){
 const client=useQueryClient();const query=useQuery({queryKey:queryKeys.run(runId),queryFn:({signal})=>getRunDetail(projectId,runId,signal),refetchInterval:q=>q.state.data&&["completed","cancelled","failed"].includes(q.state.data.run.status)?false:1500});
 const mutation=useMutation({mutationFn:(input:RunActionRequest)=>controlRun(projectId,runId,input),onSuccess:async()=>{await Promise.all([client.invalidateQueries({queryKey:queryKeys.run(runId)}),client.invalidateQueries({queryKey:queryKeys.project(projectId)})]);onAccepted?.();}});
 if(query.isError)return <ErrorNote error={query.error}/>;if(!query.data)return <p role="status">正在读取创作进度…</p>;
 const {run,result,availableActions}=query.data;const content=result.manuscriptCandidate?.content;const plan=result.planCandidate?.chapterGoal;
 const labels:Record<string,string>={accept_plan:"采用章纲",accept_manuscript:"接受正文",discard_manuscript:"放弃正文",pause:"暂停",resume:"继续",cancel:"取消任务",switch_to_manual:"改为手工写作",retry_chapter:"重试创作"};
 return <article className="cf-card cf-task"><h3>{run.recipe==="chapter-production"?"章节创作":run.recipe.includes("review")?"章节检查":run.recipe.includes("selection")?"选区改写":"创作任务"}</h3><span className="cf-badge">{states[run.status]??"正在处理"}</span>{typeof plan==="string"?<p>{plan}</p>:null}{typeof content==="string"?<><h4>AI 建议正文</h4><pre>{content}</pre><small>接受后才会写入正式正文。</small></>:null}{result.documentId?<p><Link className="cf-text-link" to={`/books/${projectId}/write/${result.documentId}`}>打开章节 →</Link></p>:null}<div className="cf-actions">{availableActions.filter(a=>labels[a]).map(action=><button key={action} className={action==="accept_manuscript"?"cf-primary":""} disabled={mutation.isPending} onClick={()=>mutation.mutate(action==="retry_chapter"?{action,requestId:crypto.randomUUID()}:{action} as RunActionRequest)}>{labels[action]}</button>)}</div>{mutation.isError?<ErrorNote error={mutation.error}/>:null}</article>;
}
