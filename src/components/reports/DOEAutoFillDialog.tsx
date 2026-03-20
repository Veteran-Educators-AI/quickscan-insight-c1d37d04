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
      ln: s.lastName,
      fn: s.firstName,
      g: s.numericGrade,
      m: s.letterGrade,
    }));

    // Build the bookmarklet script
    const script = `
(function(){
  var grades=${JSON.stringify(gradeData)};
  var matched=0,skipped=0,errors=[];
  
  /* Try to find grade input rows in DOE Gradebook */
  var rows=document.querySelectorAll('tr,div[class*="student"],div[class*="row"],div[class*="grade"]');
  if(!rows.length){rows=document.querySelectorAll('table tr');}
  
  grades.forEach(function(g){
    var found=false;
    for(var i=0;i<rows.length;i++){
      var txt=rows[i].textContent||'';
      var hasLast=txt.toLowerCase().indexOf(g.ln.toLowerCase())>-1;
      var hasFirst=txt.toLowerCase().indexOf(g.fn.toLowerCase())>-1;
      if(hasLast&&hasFirst){
        var inputs=rows[i].querySelectorAll('input,select,textarea,[contenteditable]');
        if(inputs.length>0){
          for(var j=0;j<inputs.length;j++){
            var inp=inputs[j];
            var placeholder=(inp.placeholder||'').toLowerCase();
            var name=(inp.name||'').toLowerCase();
            var ariaLabel=(inp.getAttribute('aria-label')||'').toLowerCase();
            var combined=placeholder+' '+name+' '+ariaLabel;
            if(combined.indexOf('mark')>-1||combined.indexOf('grade')>-1||combined.indexOf('score')>-1||j===0){
              if(inp.tagName==='SELECT'){
                var opts=inp.querySelectorAll('option');
                for(var k=0;k<opts.length;k++){
                  if(opts[k].value===g.m||opts[k].textContent.trim()===g.m){
                    inp.value=opts[k].value;
                    inp.dispatchEvent(new Event('change',{bubbles:true}));
                    found=true;break;
                  }
                }
              } else if(inp.getAttribute('contenteditable')){
                inp.textContent=g.g.toString();
                inp.dispatchEvent(new Event('input',{bubbles:true}));
                found=true;
              } else {
                inp.value=g.g.toString();
                inp.dispatchEvent(new Event('input',{bubbles:true}));
                inp.dispatchEvent(new Event('change',{bubbles:true}));
                found=true;
              }
              if(found)break;
            }
          }
        }
        if(found){matched++;break;}
      }
    }
    if(!found){skipped++;errors.push(g.fn+' '+g.ln);}
  });
  
  var msg='DOE Auto-Fill Complete!\\n\\n'+matched+' students matched and filled.';
  if(skipped>0){msg+='\\n'+skipped+' students not found:\\n'+errors.join(', ');}
  msg+='\\n\\nPlease review all entries before saving!';
  alert(msg);
})();`.trim();

    return `javascript:${encodeURIComponent(script)}`;
  }, [students]);

  const handleCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopied(true);
      toast.success('Bookmarklet code copied! Follow the instructions to use it.');
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
            Automatically fill grades into the NYC DOE Gradebook page
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              How to use
            </h4>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>Click <strong>"Copy Auto-Fill Script"</strong> below</li>
              <li>Open <strong>NYC DOE Gradebook</strong> in your browser and navigate to the class</li>
              <li>Open your browser's <strong>address bar</strong> (click it or press Ctrl+L / Cmd+L)</li>
              <li><strong>Paste</strong> the copied script and press <strong>Enter</strong></li>
              <li>Review the filled grades, then <strong>Save</strong> in DOE Gradebook</li>
            </ol>
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mt-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Some browsers strip "javascript:" when pasting. If it doesn't work, create a bookmark, edit it, and paste the script as the URL instead.</span>
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
