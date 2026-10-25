"""Render an honest, narrated walkthrough from inspected Figma prototype screenshots.

Dependencies: Pillow, ffmpeg, and piper-tts. Voice model is provided as argv[1].
The result is an edited prototype walkthrough, not a browser screen recording.
"""
from pathlib import Path
import json, subprocess, sys, wave, textwrap
from PIL import Image, ImageDraw, ImageFont
from piper import PiperVoice, SynthesisConfig

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
WORK=Path('/tmp/ledgerlens-video-work');WORK.mkdir(exist_ok=True)
scenes=json.loads((HERE/'narration.json').read_text())
voice=PiperVoice.load(sys.argv[1])
fontdir=ROOT/'node_modules/geist/dist/fonts'
def font(size,mono=False,weight='Regular'):
    return ImageFont.truetype(str(fontdir/('geist-mono' if mono else 'geist-sans')/(('GeistMono' if mono else 'Geist')+'-'+weight+'.ttf')),size)
def wrapped(draw,text,xy,width,f,fill,spacing=12):
    words=text.split();lines=[];line=''
    for word in words:
        trial=(line+' '+word).strip()
        if draw.textlength(trial,font=f)>width and line:lines.append(line);line=word
        else:line=trial
    if line:lines.append(line)
    draw.multiline_text(xy,'\n'.join(lines),font=f,fill=fill,spacing=spacing)
def timestamp(s):
    ms=round(s*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
total=0;srt=[];index=1;clips=[]
for i,scene in enumerate(scenes):
    audio=WORK/f'{i:02}.wav'
    if not audio.exists():
        with wave.open(str(audio),'wb') as wav:
            voice.synthesize_wav(scene['text'],wav,SynthesisConfig(length_scale=.96))
    with wave.open(str(audio)) as wav:duration=wav.getnframes()/wav.getframerate()+1.0
    im=Image.new('RGB',(1920,1080),'#f6f4ee');d=ImageDraw.Draw(im)
    d.text((70,48),'LedgerLens',font=font(32,weight='Medium'),fill='#111111')
    d.text((70,135),f'{i+1:02} / {len(scenes):02}',font=font(18,True),fill='#1662e6')
    wrapped(d,scene['title'],(70,225),365,font(62,weight='Medium'),'#111111',14)
    wrapped(d,scene['caption'],(74,650),345,font(24),'#62625c',10)
    wrapped(d,'GUIDED FIGMA PROTOTYPE\nFictional records · No funds moved',(74,835),345,font(15,True),'#62625c',9)
    shot=Image.open(HERE/scene['image']).convert('RGB');shot.thumbnail((1400,900),Image.Resampling.LANCZOS)
    pos=(470+(1400-shot.width)//2,70+(900-shot.height)//2)
    im.paste(shot,pos);d.rectangle((pos[0]-1,pos[1]-1,pos[0]+shot.width,pos[1]+shot.height),outline='#d9d7d0',width=1)
    for k in range(len(scenes)):
        d.rectangle((74+k*49,1000,110+k*49,1005),fill='#1662e6' if k<=i else '#d9d7d0')
    frame=WORK/f'{i:02}.png';im.save(frame)
    chunks=textwrap.wrap(scene['text'],width=115,break_long_words=False,break_on_hyphens=False)
    cursor=total+.2;available=duration-.6;word_total=sum(len(x.split()) for x in chunks)
    local=[]
    for chunk in chunks:
        end=cursor+available*len(chunk.split())/word_total
        local.append(f'{index}\n{timestamp(cursor)} --> {timestamp(end)}\n'+textwrap.fill(chunk,width=66)+'\n')
        srt.append(local[-1]);index+=1;cursor=end
    (WORK/f'{i:02}.srt').write_text('\n'.join(local))
    # Each clip's subtitles use its own timeline.
    local_index=1;local_srt=[];cursor=.2
    for chunk in chunks:
        end=cursor+available*len(chunk.split())/word_total
        local_srt.append(f'{local_index}\n{timestamp(cursor)} --> {timestamp(end)}\n'+textwrap.fill(chunk,width=66)+'\n');local_index+=1;cursor=end
    sub=WORK/f'{i:02}-local.srt';sub.write_text('\n'.join(local_srt))
    clip=WORK/f'{i:02}.mp4'
    vf=f"subtitles={sub}:force_style='FontName=DejaVu Sans,FontSize=8,PrimaryColour=&H00FFFFFF,OutlineColour=&H00202020,BorderStyle=3,Outline=0.5,MarginV=6'"
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-i',str(frame),'-i',str(audio),'-t',str(duration),'-vf',vf,'-r','24','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-af','apad=pad_dur=1,loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','128k','-movflags','+faststart',str(clip)],check=True)
    clips.append(clip);total+=duration;print(f'Scene {i+1}: {duration:.1f}s',flush=True)
assert total<180,f'Video exceeds the brief: {total:.1f}s'
listing=WORK/'concat.txt';listing.write_text('\n'.join("file '"+str(c)+"'" for c in clips))
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(HERE/'ledgerlens-demo.mp4')],check=True)
(HERE/'ledgerlens-demo.srt').write_text('\n'.join(srt))
(HERE/'video-metadata.json').write_text(json.dumps({'durationSeconds':round(total,2),'resolution':'1920x1080','framesPerSecond':24,'type':'edited guided Figma prototype walkthrough','narration':'synthetic; Piper LJ Speech public-domain dataset voice','liveBrowserRecording':False},indent=2))
print(f'COMPLETE: {total:.1f}s / {total/60:.2f} minutes',flush=True)
