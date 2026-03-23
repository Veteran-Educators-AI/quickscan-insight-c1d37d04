import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Copy, Zap, CheckCircle2, AlertTriangle, BookOpen, Edit2, XCircle, ShieldCheck } from 'lucide-react';

interface StudentGradeData {
  lastName: string;
  firstName: string;
  className: string;
  numericGrade: number;
  letterGrade: string;
  assessmentCount: number;
}

interface ValidationError {
  index: number;
  field: string;
  message: string;
}

interface DOEAutoFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StudentGradeData[];
}

const getLetterGrade = (avg: number): string => {
  if (avg >= 97) return 'A+';
  if (avg >= 93) return 'A';
  if (avg >= 90) return 'A-';
  if (avg >= 87) return 'B+';
  if (avg >= 83) return 'B';
  if (avg >= 80) return 'B-';
  if (avg >= 77) return 'C+';
  if (avg >= 73) return 'C';
  if (avg >= 70) return 'C-';
  if (avg >= 67) return 'D+';
  if (avg >= 65) return 'D';
  return 'F';
};

export function DOEAutoFillDialog({ open, onOpenChange, students }: DOEAutoFillDialogProps) {
  const [copied, setCopied] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ lastName: string; firstName: string; grade: string }>({ lastName: '', firstName: '', grade: '' });
  const [overrides, setOverrides] = useState<Map<number, { lastName?: string; firstName?: string; numericGrade?: number; letterGrade?: string }>>(new Map());
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());

  // Merge overrides into student data
  const effectiveStudents = useMemo(() => {
    return students.map((s, i) => {
      if (excludedIndices.has(i)) return null;
      const ov = overrides.get(i);
      if (!ov) return s;
      return {
        ...s,
        lastName: ov.lastName ?? s.lastName,
        firstName: ov.firstName ?? s.firstName,
        numericGrade: ov.numericGrade ?? s.numericGrade,
        letterGrade: ov.letterGrade ?? s.letterGrade,
      };
    }).filter(Boolean) as StudentGradeData[];
  }, [students, overrides, excludedIndices]);

  // Validate all entries
  const validationErrors = useMemo(() => {
    const errors: ValidationError[] = [];
    students.forEach((s, i) => {
      if (excludedIndices.has(i)) return;
      const ov = overrides.get(i);
      const lastName = (ov?.lastName ?? s.lastName).trim();
      const firstName = (ov?.firstName ?? s.firstName).trim();
      const grade = ov?.numericGrade ?? s.numericGrade;

      if (!lastName) {
        errors.push({ index: i, field: 'lastName', message: `Row ${i + 1}: Missing last name` });
      } else if (lastName.length > 50) {
        errors.push({ index: i, field: 'lastName', message: `Row ${i + 1}: Last name too long` });
      }
      if (!firstName) {
        errors.push({ index: i, field: 'firstName', message: `Row ${i + 1}: Missing first name` });
      } else if (firstName.length > 50) {
        errors.push({ index: i, field: 'firstName', message: `Row ${i + 1}: First name too long` });
      }
      if (grade < 0 || grade > 100) {
        errors.push({ index: i, field: 'grade', message: `Row ${i + 1}: Grade must be 0–100 (got ${grade})` });
      }
      if (isNaN(grade)) {
        errors.push({ index: i, field: 'grade', message: `Row ${i + 1}: Grade is not a number` });
      }
    });

    // Check for duplicate names
    const seen = new Map<string, number>();
    students.forEach((s, i) => {
      if (excludedIndices.has(i)) return;
      const ov = overrides.get(i);
      const key = `${(ov?.lastName ?? s.lastName).trim().toLowerCase()}|${(ov?.firstName ?? s.firstName).trim().toLowerCase()}`;
      if (seen.has(key)) {
        errors.push({ index: i, field: 'duplicate', message: `Row ${i + 1}: Duplicate name "${s.firstName} ${s.lastName}" (same as row ${(seen.get(key)!) + 1})` });
      } else {
        seen.set(key, i);
      }
    });

    return errors;
  }, [students, overrides, excludedIndices]);

  // Only block on critical errors (NaN grades), treat others as warnings
  const criticalErrors = validationErrors.filter(e => e.field === 'grade' && e.message.includes('not a number'));
  const hasBlockingErrors = criticalErrors.length > 0;
  const hasWarnings = validationErrors.length > 0;
  const errorIndices = new Set(validationErrors.map(e => e.index));

  const startEdit = (i: number) => {
    const s = students[i];
    const ov = overrides.get(i);
    setEditingIndex(i);
    setEditValues({
      lastName: ov?.lastName ?? s.lastName,
      firstName: ov?.firstName ?? s.firstName,
      grade: String(ov?.numericGrade ?? s.numericGrade),
    });
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const grade = parseInt(editValues.grade, 10);
    if (isNaN(grade) || grade < 0 || grade > 100) {
      toast.error('Grade must be a number between 0 and 100');
      return;
    }
    const newOverrides = new Map(overrides);
    newOverrides.set(editingIndex, {
      lastName: editValues.lastName.trim(),
      firstName: editValues.firstName.trim(),
      numericGrade: grade,
      letterGrade: getLetterGrade(grade),
    });
    setOverrides(newOverrides);
    setEditingIndex(null);
    toast.success('Entry updated');
  };

  const toggleExclude = (i: number) => {
    const next = new Set(excludedIndices);
    if (next.has(i)) {
      next.delete(i);
    } else {
      next.add(i);
    }
    setExcludedIndices(next);
  };

  const bookmarkletCode = useMemo(() => {
    if (!effectiveStudents.length) return '';

    const gradeData = effectiveStudents.map(s => ({
      ln: s.lastName.trim(),
      fn: s.firstName.trim(),
      g: s.numericGrade,
      m: s.letterGrade,
    }));

    const script = `
(function(){
  try{
  var grades=${JSON.stringify(gradeData)};
  var matched=0,skipped=0,errors=[],filled_list=[];
  
  function norm(s){
    return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z\\s]/g,'').replace(/\\s+/g,' ').trim();
  }
  
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
  
  function fnMatch(a,b){
    var na=norm(a),nb=norm(b);
    if(!na||!nb) return false;
    if(na===nb) return true;
    if(na.length>=3 && nb.startsWith(na)) return true;
    if(nb.length>=3 && na.startsWith(nb)) return true;
    for(var key in nicks){
      var all=[key].concat(nicks[key]);
      if(all.indexOf(na)>-1 && all.indexOf(nb)>-1) return true;
    }
    if(na.length>=4 && nb.length>=4 && levenshtein(na,nb)<=2) return true;
    return false;
  }
  
  function levenshtein(a,b){
    var m=a.length,n=b.length,d=[];
    for(var i=0;i<=m;i++){d[i]=[i];}
    for(var j=0;j<=n;j++){d[0][j]=j;}
    for(i=1;i<=m;i++){
      for(j=1;j<=n;j++){
        d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
      }
    }
    return d[m][n];
  }
  
  function matchScore(rowText,g){
    var rt=norm(rowText);
    var ln=norm(g.ln), fn=norm(g.fn);
    if(!ln) return 0;
    var hasLast=rt.indexOf(ln)>-1;
    if(!hasLast){
      var lnParts=ln.split(' ');
      hasLast=lnParts.some(function(p){return p.length>=3 && rt.indexOf(p)>-1;});
    }
    if(!hasLast) return 0;
    var score=10;
    if(fn && rt.indexOf(fn)>-1){
      score+=20;
    } else if(fn){
      var words=rt.split(/\\s+/);
      for(var w=0;w<words.length;w++){
        if(fnMatch(fn,words[w])){score+=15;break;}
      }
    }
    if(fn && new RegExp(ln+'\\\\s*,\\\\s*'+fn).test(rt)) score+=10;
    return score;
  }
  
  /* Validate page is DOE Gradebook */
  var loc=window.location.href.toLowerCase();
  var isDOE=loc.indexOf('schools.nyc')>-1||loc.indexOf('gradebook')>-1||loc.indexOf('doe')>-1;
  if(!isDOE){
    if(!confirm('This does not appear to be the NYC DOE Gradebook page.\\nCurrent URL: '+window.location.href+'\\n\\nContinue anyway?')){
      return;
    }
  }
  
  var allRows=[];
  document.querySelectorAll('table tr').forEach(function(tr){allRows.push(tr);});
  document.querySelectorAll('div[class*="student"],div[class*="row"],div[class*="grade"],div[role="row"]').forEach(function(d){allRows.push(d);});
  
  if(allRows.length===0){
    alert('ERROR: No student rows found on this page.\\n\\nMake sure you are on the correct DOE Gradebook class page with students visible.');
    return;
  }
  
  var usedRows=new Set();
  
  grades.forEach(function(g){
    var bestRow=null, bestScore=0;
    for(var i=0;i<allRows.length;i++){
      if(usedRows.has(i)) continue;
      var s=matchScore(allRows[i].textContent||'',g);
      if(s>bestScore){bestScore=s;bestRow=i;}
    }
    
    if(bestRow!==null && bestScore>=10){
      var row=allRows[bestRow];
      var inputs=row.querySelectorAll('input,select,textarea,[contenteditable]');
      var filled=false;
      
      if(inputs.length>0){
        for(var j=0;j<inputs.length;j++){
          var inp=inputs[j];
          var placeholder=(inp.placeholder||'').toLowerCase();
          var iname=(inp.name||'').toLowerCase();
          var ariaLabel=(inp.getAttribute('aria-label')||'').toLowerCase();
          var type=(inp.type||'').toLowerCase();
          var combined=placeholder+' '+iname+' '+ariaLabel+' '+type;
          
          if(combined.indexOf('comment')>-1||combined.indexOf('note')>-1) continue;
          if(type==='hidden'||type==='checkbox'||type==='radio') continue;
          
          var isGradeField=combined.indexOf('mark')>-1||combined.indexOf('grade')>-1||combined.indexOf('score')>-1||combined.indexOf('number')>-1;
          
          if(isGradeField||j===0){
            try{
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
                var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
                if(setter&&setter.set){
                  setter.set.call(inp,String(g.g));
                } else {
                  inp.value=String(g.g);
                }
                inp.dispatchEvent(new Event('input',{bubbles:true}));
                inp.dispatchEvent(new Event('change',{bubbles:true}));
                inp.dispatchEvent(new Event('blur',{bubbles:true}));
                filled=true;
              }
            }catch(e){
              errors.push(g.fn+' '+g.ln+' (input error: '+e.message+')');
            }
            if(filled){
              inp.style.outline='3px solid #28a745';
              inp.style.backgroundColor='#d4edda';
              setTimeout(function(el){return function(){el.style.outline='';el.style.backgroundColor='';}}(inp),4000);
              break;
            }
          }
        }
      }
      
      if(filled){
        matched++;
        usedRows.add(bestRow);
        filled_list.push(g.fn+' '+g.ln+' = '+g.g+'% ('+g.m+')');
      } else {
        skipped++;
        errors.push(g.fn+' '+g.ln+' (row found but no editable grade field)');
      }
    } else {
      skipped++;
      errors.push(g.fn+' '+g.ln+' (no matching name on page)');
    }
  });
  
  var msg='DOE GRADEBOOK AUTO-FILL REPORT\\n';
  msg+='================================\\n\\n';
  msg+='\\u2705 MATCHED: '+matched+' of '+grades.length+' students\\n';
  if(matched>0){
    msg+='\\nFilled grades:\\n'+filled_list.join('\\n')+'\\n';
  }
  if(skipped>0){
    msg+='\\n\\u274c FAILED: '+skipped+' students\\n'+errors.join('\\n')+'\\n';
    msg+='\\nTip: Check that student names in your app match the DOE roster exactly.';
  }
  msg+='\\n\\n\\u26a0\\ufe0f IMPORTANT: Review all green-highlighted fields, then click Save in DOE Gradebook!';
  alert(msg);
  
  }catch(err){
    alert('AUTO-FILL ERROR\\n\\nSomething went wrong: '+err.message+'\\n\\nPlease try again or contact support.\\n\\nPage: '+window.location.href);
  }
})();`.trim();

    return `javascript:${encodeURIComponent(script)}`;
  }, [effectiveStudents]);

  const handleCopyBookmarklet = async () => {
    if (hasErrors) {
      toast.error('Fix validation errors before copying the script');
      return;
    }
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopied(true);
      toast.success(`Auto-fill script copied with ${effectiveStudents.length} students!`);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Failed to copy. Try selecting and copying manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        setEditingIndex(null);
        setOverrides(new Map());
        setExcludedIndices(new Set());
      }
      onOpenChange(o);
    }}>
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
          {/* Validation errors */}
          {hasErrors && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
              <h4 className="font-semibold text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {validationErrors.length} validation error{validationErrors.length > 1 ? 's' : ''} — fix before pushing
              </h4>
              <ul className="text-xs space-y-0.5 text-destructive/80">
                {validationErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>• {e.message}</li>
                ))}
                {validationErrors.length > 5 && (
                  <li>...and {validationErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {/* No errors badge */}
          {!hasErrors && effectiveStudents.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-400">
                All {effectiveStudents.length} entries validated — ready to push
              </span>
            </div>
          )}

          {/* How matching works */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              How name matching works
            </h4>
            <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
              <li><strong>Exact match</strong> — last name + first name found in the same row</li>
              <li><strong>Nickname match</strong> — recognizes common nicknames (Will → William)</li>
              <li><strong>Fuzzy match</strong> — handles minor spelling differences (Jayln → Jaelyn)</li>
              <li><strong>Error report</strong> — unmatched students are listed with specific reasons</li>
            </ul>
          </div>

          {/* Instructions */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
            <h4 className="font-semibold text-sm">Steps</h4>
            <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
              <li>Review & edit grades below (click ✏️ to fix names/grades, ✕ to exclude)</li>
              <li>Click <strong>"Copy Auto-Fill Script"</strong></li>
              <li>Open <strong>apps.schools.nyc/GradeBook/coursegradebook</strong></li>
              <li>Paste in <strong>address bar</strong> (Ctrl+L → Paste → Enter)</li>
              <li>Matched fields flash <strong>green</strong> — review, then <strong>Save</strong></li>
            </ol>
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mt-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>If pasting doesn't work, create a bookmark and paste the script as its URL.</span>
            </div>
          </div>

          {/* Preview of grades with edit/exclude */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">
                Grades to push ({effectiveStudents.length} students
                {excludedIndices.size > 0 && `, ${excludedIndices.size} excluded`})
              </h4>
            </div>
            <ScrollArea className="h-[220px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8"></TableHead>
                    <TableHead className="text-xs">Last Name</TableHead>
                    <TableHead className="text-xs">First Name</TableHead>
                    <TableHead className="text-xs">Grade</TableHead>
                    <TableHead className="text-xs">Mark</TableHead>
                    <TableHead className="text-xs w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, i) => {
                    const isExcluded = excludedIndices.has(i);
                    const isEditing = editingIndex === i;
                    const hasError = errorIndices.has(i);
                    const ov = overrides.get(i);
                    const displayLn = ov?.lastName ?? s.lastName;
                    const displayFn = ov?.firstName ?? s.firstName;
                    const displayGrade = ov?.numericGrade ?? s.numericGrade;
                    const displayMark = ov?.letterGrade ?? s.letterGrade;

                    if (isEditing) {
                      return (
                        <TableRow key={i} className="bg-accent/20">
                          <TableCell className="py-1"></TableCell>
                          <TableCell className="py-1">
                            <Input
                              value={editValues.lastName}
                              onChange={(e) => setEditValues(v => ({ ...v, lastName: e.target.value }))}
                              className="h-7 text-xs"
                              maxLength={50}
                            />
                          </TableCell>
                          <TableCell className="py-1">
                            <Input
                              value={editValues.firstName}
                              onChange={(e) => setEditValues(v => ({ ...v, firstName: e.target.value }))}
                              className="h-7 text-xs"
                              maxLength={50}
                            />
                          </TableCell>
                          <TableCell className="py-1">
                            <Input
                              value={editValues.grade}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setEditValues(v => ({ ...v, grade: val }));
                              }}
                              className="h-7 text-xs w-16"
                              maxLength={3}
                            />
                          </TableCell>
                          <TableCell className="py-1"></TableCell>
                          <TableCell className="py-1">
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEdit}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingIndex(null)}>
                                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return (
                      <TableRow
                        key={i}
                        className={`${isExcluded ? 'opacity-40 line-through' : ''} ${hasError ? 'bg-destructive/5' : ''}`}
                      >
                        <TableCell className="py-1.5 text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs py-1.5">{displayLn}</TableCell>
                        <TableCell className="text-xs py-1.5">{displayFn}</TableCell>
                        <TableCell className="text-xs py-1.5 font-mono">{displayGrade}%</TableCell>
                        <TableCell className="text-xs py-1.5">
                          <Badge variant="outline" className="text-xs">{displayMark}</Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(i)} title="Edit">
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => toggleExclude(i)}
                              title={isExcluded ? 'Include' : 'Exclude'}
                            >
                              <XCircle className={`h-3 w-3 ${isExcluded ? 'text-green-600' : 'text-destructive'}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
            disabled={!effectiveStudents.length || hasErrors}
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
