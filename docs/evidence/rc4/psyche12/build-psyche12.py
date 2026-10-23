import json,subprocess
import os
REC='/tmp/hk-video/page.webm'  # uncaptioned page recording (rc4-psyche8 take)
CAP='/tmp/amz-psyche9-bak/repo/hearthkeep-demo.mp4'  # rc4-psyche8 170 s file: L1-L9 audio taken from here
SRC='base-nocap.mp4'
if not os.path.exists(SRC):
  subprocess.run(['ffmpeg','-v','error','-y','-i',REC,'-i',CAP,'-filter_complex','[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xe7dfd2,fps=30,trim=0:170,setpts=PTS-STARTPTS[v]','-map','[v]','-map','1:a:0','-t','170','-c:v','libx264','-preset','veryfast','-crf','8','-pix_fmt','yuv420p','-c:a','copy',SRC],check=True)
segs=[('S',0,5.5),('S',11.8,33),('S',39,45.0),('F',45.0,7.64),('S',45.0,64.0),('S',80,96.5),('S',104.5,110.0),('F',110.0,4.08),('S',110.0,125.0),('S',131.5,135.9),('F',135.9,5.54),('S',135.9,141.0),('S',145.5,152.0),('F',151.95,2.2),('S',152.0,170)]
starts=[];t=0
for s in segs:
  starts.append(t); t+= (s[2]-s[1]) if s[0]=='S' else s[2]
TOTAL=round(t,3)
def m(x,seg=None):
  for i,s in enumerate(segs):
    if seg is not None and i!=seg: continue
    if s[0]=='S' and s[1]<=x<=s[2]: return round(starts[i]+x-s[1],3)
  raise Exception(x)
segi=lambda i:starts[i]
L={'L1':0,'L2':m(12),'L3':m(24),'L4':m(40),'L5':m(80),'L6':m(105),'L7':m(132),'L8':m(147),'L9':m(162)}
W={'A1':m(26.3),'G1':m(44.6),'G2':m(49.3,4),'G3':m(58.0),'B1':m(82.8),'B2':m(90.0),'C1':m(109.0),'C2':round(segi(8)+0.1,3),'C3':m(115.7),'D1':m(135.8),'D2':round(segi(11)+0.4,3),'E1':m(151.0),'E2':m(154.2)}
wav={k:(f'/tmp/amz9/lines/{k}.wav' if k[0]=='G' else f'/tmp/a10/lines/{k}.wav') for k in W}
json.dump({'TOTAL':TOTAL,'L':L,'W':W,'starts':starts,'segs':segs},open('plan.json','w'),indent=1)
F=[];C=''
n=len(segs)
F.append(f'[0:v]split={n}'+''.join(f'[w{i}]' for i in range(n)))
F.append(f'[0:a]asplit={n}'+''.join(f'[m{i}]' for i in range(n)))
for i,s in enumerate(segs):
  if s[0]=='S':
    F.append(f'[w{i}]trim={s[1]}:{s[2]},setpts=PTS-STARTPTS[v{i}]'); F.append(f'[m{i}]atrim={s[1]}:{s[2]},asetpts=PTS-STARTPTS[a{i}]')
  else:
    F.append(f'[w{i}]trim=start={s[1]}:duration=0.034,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={s[2]},trim=duration={s[2]}[v{i}]')
    F.append(f'[m{i}]atrim=0:0.001,volume=0,apad=whole_dur={s[2]},atrim=0:{s[2]}[a{i}]')
  C+=f'[v{i}][a{i}]'
F.append(C+f'concat=n={n}:v=1:a=1[cv0][ca]')
LT={'L1':'Upkeep you only notice when something beeps.','L2':'A real MCP server, spec 2025-11-25 over Streamable HTTP, behind a simulated Alexa+ experience.','L3':'The simulator speaks first.','L4':'Exact-fit part, policy filter, code-gated mock purchase.','L5':'It uses what you already own.','L6':'It places a mock booking with the pro. The limit is enforced by the server.','L7':'New session, same memory. Safety beats shopping.','L8':'Verifiable protocol behaviour, and open source.','L9':'Fictional sample data. Simulated Alexa+ experience.'}
WT=json.load(open('gap-lines.json'))
dur=lambda f: float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]))
ev=[(t,k,dur(f'/tmp/hk-video/lines/{k}.wav'),LT[k]) for k,t in L.items()]+[(t,k,dur(wav[k]),WT[k]) for k,t in W.items()]
ev.sort()
cues=[]
for i,(t,k,d,txt) in enumerate(ev):
  end=round(t+d+0.4,2)
  if i+1<len(ev): end=min(end,ev[i+1][0])
  end=min(end,TOTAL); cues.append((k,round(t,2),end,txt))
def st(x): h=int(x//3600);m_=int(x%3600//60);s_=x%60; return f'{h:02d}:{m_:02d}:{s_:06.3f}'.replace('.',',')
open('hearthkeep-demo.srt','w').write(''.join(f'{i+1}\n{st(a)} --> {st(b)}\n{txt}\n\n' for i,(k,a,b,txt) in enumerate(cues)))
json.dump(cues,open('cues.json','w'),indent=1)
def at(x): return f'{int(x//3600)}:{int(x%3600//60):02d}:{x%60:05.2f}'
ass=open('/tmp/p12/build/style.ass').read()+''.join(f'Dialogue: 0,{at(a)},{at(b)},Caption,,0,0,0,,{txt}\n' for k,a,b,txt in cues)
open('captions22.ass','w').write(ass)
F.append('[cv0]subtitles=captions22.ass:fontsdir=/usr/share/fonts[cv]')
lab='[ca]';ins=['-i',SRC]
for j,(k,t0) in enumerate(W.items()):
  ins+=['-i',wav[k]];d=int(t0*1000)
  F.append(f'[{j+1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay={d}|{d}[g{j}]'); lab+=f'[g{j}]'
F.append(lab+f'amix=inputs={len(W)+1}:duration=first:dropout_transition=0:normalize=0[a]')
cmd=['ffmpeg','-v','error','-y']+ins+['-filter_complex',';'.join(F),'-map','[cv]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart','final.mp4']
subprocess.run(cmd,check=True)
print(TOTAL,L,W)
