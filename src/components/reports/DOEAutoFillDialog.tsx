import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Copy, Zap, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';

interface StudentGradeData {
  lastName: string;
  firstName: string;
  className: string;
  numericGrade: number;
  letterGrade: string;
  assessmentCount: number;
}

interface DOEAutoFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StudentGradeData[];
}

export function DOEAutoFillDialog({ open, onOpenChange, students }: DOEAutoFillDialogProps) {
  const [copied, setCopied] = useState(false);

  const bookmarkletCode = useMemo(() => {
    if (!students.length) return '';

    const gradeData = students.map(s => ({
      ln: s.lastName.trim(),
      fn: s.firstName.trim(),
      g: s.numericGrade,
      m: s.letterGrade,
    }));

    // Build the bookmarklet script with robust name matching
    const script = `
(function(){
  var grades=${JSON.stringify(gradeData)};
  var matched=0,skipped=0,errors=[];
  
  /* Normalize helper: lowercase, strip accents, trim, collapse spaces */
  function norm(s){
    return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z\\s]/g,'').replace(/\\s+/g,' ').trim();
  }
  
  /* Common nickname map for fuzzy first-name matching */
  var nicks={
    'william':['will','willy','bill','billy','liam'],
    'james':['jim','jimmy','jamie'],
    'robert':['rob','robbie','bob','bobby'],
    'richard':['rick','ricky','rich','dick'],
    'michael':['mike','mikey'],
    'joseph':['joe','joey'],
    'thomas':['tom','tommy'],
    'christopher':['chris'],
    'daniel':['dan','danny'],
    'matthew':['matt','matty'],
    'anthony':['tony'],
    'nicholas':['nick','nicky'],
    'alexander':['alex'],
    'benjamin':['ben','benny'],
    'samuel':['sam','sammy'],
    'jonathan':['jon','john'],
    'joshua':['josh'],
    'andrew':['andy','drew'],
    'timothy':['tim','timmy'],
    'stephen':['steve','steven'],
    'elizabeth':['liz','lizzy','beth','betty','eliza'],
    'jennifer':['jen','jenny'],
    'katherine':['kate','kathy','katie','kat'],
    'catherine':['cathy','cat','kate'],
    'margaret':['maggie','meg','peggy'],
    'patricia':['pat','patty','trish'],
    'jessica':['jess','jessie'],
    'christina':['chris','christy','tina'],
    'jacqueline':['jackie'],
    'gabriella':['gabby','gabi'],
    'isabella':['bella','izzy'],
    'victoria':['vicky','tori'],
    'alexandra':['alex','lexi'],
    'madeline':['maddy'],
    'natalie':['nat'],
    'stephanie':['steph'],
    'jaelyn':['jayln','jayla','jae'],
    'jaylen':['jayln','jay']
  };
  
  /* Check if two first names match (exact, prefix, or nickname) */
  function fnMatch(a,b){
    var na=norm(a),nb=norm(b);
    if(!na||!nb) return false;
    if(na===nb) return true;
    /* Prefix match (at least 3 chars) */
    if(na.length>=3 && nb.startsWith(na)) return true;
    if(nb.length>=3 && na.startsWith(nb)) return true;
    /* Nickname match */
    for(var key in nicks){
      var all=[key].concat(nicks[key]);
      var aIn=all.indexOf(na)>-1;
      var bIn=all.indexOf(nb)>-1;
      if(aIn&&bIn) return true;
    }
    /* Levenshtein distance <= 2 for names >= 4 chars */
    if(na.length>=4 && nb.length>=4){
      var d=levenshtein(na,nb);
      if(d<=2) return true;
    }
    return false;
  }
  
  function levenshtein(a,b){
    var m=a.length,n=b.length,d=[];
    for(var i=0;i<=m;i++){d[i]=[i];}
    for(var j=0;j<=n;j++){d[0][j]=j;}
    for(i=1;i<=m;i++){
      for(j=1;j<=n;j++){
        d[i][j]=Math.min(
          d[i-1][j]+1,
          d[i][j-1]+1,
          d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)
        );
      }
    }
    return d[m][n];
  }
  
  /* Score how well a row matches a student (higher = better) */
  function matchScore(rowText,g){
    var rt=norm(rowText);
    var ln=norm(g.ln), fn=norm(g.fn);
    if(!ln) return 0;
    
    /* Must contain last name (exact or close) */
    var hasLast=rt.indexOf(ln)>-1;
    if(!hasLast){
      /* Try partial last name match for hyphenated/compound names */
      var lnParts=ln.split(' ');
      hasLast=lnParts.some(function(p){return p.length>=3 && rt.indexOf(p)>-1;});
    }
    if(!hasLast) return 0;
    
    var score=10; /* Base score for last name match */
    
    /* Check first name */
    if(fn && rt.indexOf(fn)>-1){
      score+=20; /* Exact first name in row */
    } else if(fn){
      /* Extract words from the row that could be first names */
      var words=rt.split(/\\s+/);
      for(var w=0;w<words.length;w++){
        if(fnMatch(fn,words[w])){
          score+=15;
          break;
        }
      }
    }
    
    /* Bonus: "Last, First" pattern (DOE format) */
    var commaPattern=ln+'\\\\s*,\\\\s*'+fn;
    if(fn && new RegExp(commaPattern).test(rt)){
      score+=10;
    }
    
    return score;
  }
  
  /* Collect all candidate rows from the page */
  var allRows=[];
  var tables=document.querySelectorAll('table');
  if(tables.length>0){
    tables.forEach(function(t){
      var trs=t.querySelectorAll('tr');
      trs.forEach(function(tr){allRows.push(tr);});
    });
  }
  /* Also check div-based layouts */
  var divRows=document.querySelectorAll('div[class*="student"],div[class*="row"],div[class*="grade"],div[role="row"]');
  divRows.forEach(function(d){allRows.push(d);});
  /* Fallback: all trs */
  if(allRows.length===0){
    document.querySelectorAll('tr').forEach(function(tr){allRows.push(tr);});
  }
  
  /* For each student, find the best matching row and fill the grade */
  var usedRows=new Set();
  
  grades.forEach(function(g){
    var bestRow=null, bestScore=0;
    
    for(var i=0;i<allRows.length;i++){
      if(usedRows.has(i)) continue;
      var txt=allRows[i].textContent||'';
      var s=matchScore(txt,g);
      if(s>bestScore){
        bestScore=s;
        bestRow=i;
      }
    }
    
    if(bestRow!==null && bestScore>=10){
      var row=allRows[bestRow];
      var inputs=row.querySelectorAll('input,select,textarea,[contenteditable]');
      var filled=false;
      
      if(inputs.length>0){
        for(var j=0;j<inputs.length;j++){
          var inp=inputs[j];
          var placeholder=(inp.placeholder||'').toLowerCase();
          var name=(inp.name||'').toLowerCase();
          var ariaLabel=(inp.getAttribute('aria-label')||'').toLowerCase();
          var type=(inp.type||'').toLowerCase();
          var combined=placeholder+' '+name+' '+ariaLabel+' '+type;
          
          /* Skip non-grade fields */
          if(combined.indexOf('comment')>-1||combined.indexOf('note')>-1) continue;
          if(type==='hidden'||type==='checkbox'||type==='radio') continue;
          
          /* Prefer fields labeled as grade/mark/score; otherwise use first text/number input */
          var isGradeField=combined.indexOf('mark')>-1||combined.indexOf('grade')>-1||combined.indexOf('score')>-1||combined.indexOf('number')>-1;
          
          if(isGradeField||j===0){
            if(inp.tagName==='SELECT'){
              var opts=inp.querySelectorAll('option');
              for(var k=0;k<opts.length;k++){
                var ov=opts[k].value.trim(),ot=opts[k].textContent.trim();
                if(ov===g.m||ot===g.m||ov===String(g.g)||ot===String(g.g)){
                  inp.value=opts[k].value;
                  inp.dispatchEvent(new Event('change',{bubbles:true}));
                  inp.dispatchEvent(new Event('input',{bubbles:true}));
                  filled=true;break;
                }
              }
            } else if(inp.getAttribute('contenteditable')){
              inp.textContent=String(g.g);
              inp.dispatchEvent(new Event('input',{bubbles:true}));
              inp.dispatchEvent(new Event('change',{bubbles:true}));
              filled=true;
            } else {
              var nativeInputValueSetter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
              nativeInputValueSetter.call(inp,String(g.g));
              inp.dispatchEvent(new Event('input',{bubbles:true}));
              inp.dispatchEvent(new Event('change',{bubbles:true}));
              inp.dispatchEvent(new Event('blur',{bubbles:true}));
              filled=true;
            }
            if(filled){
              inp.style.backgroundColor='#d4edda';
              setTimeout(function(el){return function(){el.style.backgroundColor='';}}(inp),3000);
              break;
            }
          }
        }
      }
      
      if(filled){
        matched++;
        usedRows.add(bestRow);
      } else {
        skipped++;
        errors.push(g.fn+' '+g.ln+' (row found, no input)');
      }
    } else {
      skipped++;
      errors.push(g.fn+' '+g.ln);
    }
  });
  
  var msg='DOE Gradebook Auto-Fill Complete!\\n\\n';
  msg+='\\u2705 '+matched+' of '+grades.length+' students matched and filled.';
  if(skipped>0){
    msg+='\\n\\u274c '+skipped+' not matched:\\n'+errors.join('\\n');
  }
  msg+='\\n\\n\\u26a0\\ufe0f Please review all entries before saving!';
  alert(msg);
})();`.trim();

    return `javascript:${encodeURIComponent(script)}`;
  }, [students]);

  const handleCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopied(true);
      toast.success('Auto-fill script copied! Paste it in your browser address bar on the DOE Gradebook page.');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Failed to copy. Try selecting and copying manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            DOE Gradebook Auto-Fill
          </DialogTitle>
          <DialogDescription>
            Matches your students to the NYC DOE Gradebook roster and fills grades automatically
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* How matching works */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              How name matching works
            </h4>
            <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
              <li><strong>Exact match</strong> — last name + first name found in the same row</li>
              <li><strong>Nickname match</strong> — recognizes common nicknames (e.g., Will → William, Mike → Michael)</li>
              <li><strong>Fuzzy match</strong> — handles minor spelling differences (Jayln → Jaelyn)</li>
              <li><strong>Smart scoring</strong> — picks the best match when multiple rows are close</li>
            </ul>
          </div>

          {/* Instructions */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
            <h4 className="font-semibold text-sm">Steps</h4>
            <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
              <li>Click <strong>"Copy Auto-Fill Script"</strong> below</li>
              <li>Open <strong>apps.schools.nyc/GradeBook/coursegradebook</strong> and navigate to your class</li>
              <li>Click your browser's <strong>address bar</strong> (Ctrl+L / Cmd+L)</li>
              <li><strong>Paste</strong> the script and press <strong>Enter</strong></li>
              <li>Matched fields briefly <strong>flash green</strong> — review and <strong>Save</strong></li>
            </ol>
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mt-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>If your browser strips "javascript:" when pasting, create a bookmark, edit it, and paste the script as the URL. Then click the bookmark on the DOE page.</span>
            </div>
          </div>

          {/* Preview of grades */}
          <div>
            <h4 className="font-medium text-sm mb-2">Grades to fill ({students.length} students)</h4>
            <ScrollArea className="h-[200px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Last Name</TableHead>
                    <TableHead className="text-xs">First Name</TableHead>
                    <TableHead className="text-xs">Grade</TableHead>
                    <TableHead className="text-xs">Mark</TableHead>
                    <TableHead className="text-xs">Assessments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs py-1.5">{s.lastName}</TableCell>
                      <TableCell className="text-xs py-1.5">{s.firstName}</TableCell>
                      <TableCell className="text-xs py-1.5 font-mono">{s.numericGrade}%</TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Badge variant="outline" className="text-xs">{s.letterGrade}</Badge>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-muted-foreground">{s.assessmentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleCopyBookmarklet}
            disabled={!students.length}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Auto-Fill Script
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
