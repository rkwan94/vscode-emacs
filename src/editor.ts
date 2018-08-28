import * as vscode from "vscode";
import KillRing from "./killring";
import Register from "./registers";
import * as sexp from "./sexp";
import StatusIndicator, { Mode } from "./statusIndicator";
import * as clipboardy from "clipboardy"

export class Editor {

  private killRing: KillRing;
  private register: Register;
  private status: StatusIndicator;
  private lastRectangularKill: string;
  private lastKill: vscode.Position;

  constructor() {
    this.status = new StatusIndicator();
    this.killRing = new KillRing();
    this.register = new Register();
    this.lastRectangularKill = null;
    this.lastKill = null;

    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (this.lastKill) {
        const position = event.selections[0].isReversed ? event.selections[0].active : event.selections[0].anchor;
        if (!position.isEqual(this.lastKill)) {
          this.lastKill = null;
        }
      }
    });
    vscode.window.onDidChangeActiveTextEditor(() => {
      this.lastKill = null;
    });
  }

  public abort = () => {
    this.status.setStatusBarMessage("Quit");
    this.status.deactivateTempModes();
  }

  public markMode = () => this.status.isModeActive(Mode.Mark);

  public rectangleMarkMode = () => this.status.isModeActive(Mode.RectangleMark);

  public toggleMarkMode = () => {
    if (this.status.isModeActive(Mode.Mark)) {
      vscode.commands.executeCommand("cancelSelection");
      this.status.deactivate(Mode.Mark);
    } else {
      const currentPosition: vscode.Position = vscode.window.activeTextEditor.selection.active;
      vscode.window.activeTextEditor.selection = new vscode.Selection(currentPosition, currentPosition);
      this.status.activate(Mode.Mark);
    }
  }

  public toggleRectangleMarkMode = () => {
    if (this.status.isModeActive(Mode.RectangleMark)) {
      vscode.commands.executeCommand("cancelSelection");
      this.status.deactivate(Mode.RectangleMark);
    } else {
      const currentPosition: vscode.Position = vscode.window.activeTextEditor.selection.active;
      vscode.window.activeTextEditor.selection = new vscode.Selection(currentPosition, currentPosition);
      this.status.activate(Mode.RectangleMark);
    }
  }

  public toggleCuaMode = () => {
    this.status.toggleMode(Mode.Cua);
  }

  public validateCuaCommand = () => {
    if (this.status.isModeActive(Mode.Cua)) {
      if (this.isRegion()) {
        return true;
      } else {
        this.status.setStatusBarMessage("Not in region", 2000);
        return false;
      }
    }

    return true;
  }

  public changeCase = (casing: "upper" | "lower" | "capitalise", type: "position" | "region") => {
    const region = vscode.window.activeTextEditor.selection;
    let currentSelection: {
      text: string,
      range: vscode.Range,
    };
    if (type === "position" && region.start.character === region.end.character) {
      const document = vscode.window.activeTextEditor.document;
      const range = document.getWordRangeAtPosition(region.start);

      currentSelection = {
        text: document.getText(range),
        range,
      };
    } else if (type === "region" && region.start.character !== region.end.character) {
      currentSelection = this.getSelectedText(region, vscode.window.activeTextEditor.document);
    } else {
      this.status.setStatusBarMessage("No region selected. Command aborted.");
      return;
    }

    const newText =
      casing === "upper" ? currentSelection.text.toUpperCase() :
      casing === "lower" ? currentSelection.text.toLowerCase() :
      currentSelection.text.charAt(0).toUpperCase() + currentSelection.text.slice(1);

    vscode.window.activeTextEditor.edit(builder => {
      builder.replace(currentSelection.range, newText);
    });
  }

  public getSelectedText(
    selection: vscode.Selection,
    document: vscode.TextDocument): { text: string, range: vscode.Range } | undefined {
    let range: vscode.Range;

    if (selection.start.line === selection.end.line && selection.start.character === selection.end.character) {
      return undefined;
    } else {
      range = new vscode.Range(selection.start, selection.end);
    }

    return {
      range,
      text: document.getText(range),
    };
  }

  public getSelectionRange(): vscode.Range {
    const selection = vscode.window.activeTextEditor.selection;
    const start = selection.start;
    const end = selection.end;

    return (start.character !== end.character || start.line !== end.line) ? new vscode.Range(start, end) : null;
  }

  public getSelection(): vscode.Selection {
    const ed = vscode.window.activeTextEditor;
    let selection = null;

    // check if there is no selection
    if (ed.selection.isEmpty) {
      selection = ed.selection;
    } else {
      selection = ed.selections[0];
    }

    return selection;
  }

  public setSelection(start: vscode.Position, end: vscode.Position): void {
    const editor = vscode.window.activeTextEditor;

    editor.selection = new vscode.Selection(start, end);
  }

  public goToNextSexp(activateMarkMode?: boolean): void {
    const ed = vscode.window.activeTextEditor;
    const startPos = this.getSelection();
    const nextPos = new vscode.Position(startPos.active.line, startPos.active.character + 1);
    const range = new vscode.Range(startPos.end, nextPos);

    const afterCursor = ed.document.getText(range);
    const whatAmI = sexp.sExpressionOrAtom(afterCursor);

    if (whatAmI === sexp.Expression.Atom) {
      vscode.commands.executeCommand("cursorWordRight").then(() => {
        if (activateMarkMode) {
          const editor = vscode.window.activeTextEditor;
          const pos = this.getSelection();
          this.setSelection(startPos.start, pos.end);
        }
      });
    } else {
      vscode.commands.executeCommand("editor.action.jumpToBracket").then(() => {
        vscode.commands.executeCommand("cursorWordRight").then(() => {
          if (activateMarkMode) {
            const editor = vscode.window.activeTextEditor;
            const pos = this.getSelection();
            this.setSelection(startPos.start, pos.end);
          }
        });
      });
    }

      // const newCursorPos = this.getSelection();

      // if (activateMarkMode) {
      //     this.setSelection(startPos.active, newCursorPos.active);
      // }
  }

  public goToPrevSexp(): void {
    const ed = vscode.window.activeTextEditor;
    const line = ed.document.getText();
    const cursorPos = ed.selection.active.character;
    const afterCursor = line.substr(cursorPos);
    const whatAmI = sexp.sExpressionOrAtom(afterCursor);

    const placeholder = sexp.turnToSexp(line);
    if (whatAmI === sexp.Expression.Atom) {
      vscode.commands.executeCommand("cursorWordLeft");
    } else {
      vscode.commands.executeCommand("cursorWordLeft");
    }
  }

  /*
    * Behave like Emacs kill command
    */
  public kill(): void {
    if (!this.validateCuaCommand()) {
      return;
    }

    const promises = [
      vscode.commands.executeCommand("emacs.exitMarkMode"),
      vscode.commands.executeCommand("cursorEndSelect"),
    ];

    Promise.all(promises).then(() => {
      const selection = this.getSelection();
      const range = new vscode.Range(selection.start, selection.end);

      const isKillRepeated = this.lastKill && range.start.isEqual(this.lastKill);

      this.setSelection(range.start, range.start);

      if (range.isEmpty) {
        this.killEndOfLine(isKillRepeated);
      } else {
        this.killText(range, isKillRepeated);
      }
      this.lastKill = range.start;
      this.saveClipboard(this.killRing.top());
    });
  }

  private saveClipboard(text: string) : void {
    vscode.workspace.getConfiguration("vscode-emacs-improved").get("emacs.setClipboardContents") 
      && clipboardy.write(text);
  }

  public killRegion(): void {
    const selection = this.getSelection();
    const range = new vscode.Range(selection.start, selection.end);

    if (!range.isEmpty) {
      this.killText(range, false);
    }
    this.lastKill = range.start;
  }

  public copy(): void {
    if (!this.validateCuaCommand()) {
      return;
    }

    const range = vscode.window.activeTextEditor.selection;
    this.killRing.save(vscode.window.activeTextEditor.document.getText(range));
    vscode.commands.executeCommand("emacs.exitMarkMode");
  }

  public yank(): void {
    if (!this.validateCuaCommand() || this.killRing.isEmpty()) {
      return;
    }
    const currPos = vscode.window.activeTextEditor.selection.start;
    vscode.window.activeTextEditor.edit((editBuilder) => {
      const topText = this.killRing.top();
      editBuilder.insert(this.getSelection().active, topText);
    }).then(() => {
      const textRange = new vscode.Range(currPos, vscode.window.activeTextEditor.selection.end);
      this.killRing.setLastInsertedRange(textRange);
    });
    this.lastKill = null;
  }

  public yankPop() {
    if (this.killRing.isEmpty()) {
      return false;
    }

    const currentPosition = vscode.window.activeTextEditor.selection.active;
    const lastInsertionRange = this.killRing.getLastRange();

    if (!lastInsertionRange.end.isEqual(currentPosition)) {
      this.status.setStatusBarMessage("Previous command was not a yank.", 3000);
      return false;
    }

    const oldInsertionPoint = this.killRing.getLastInsertionPoint();
    vscode.window.activeTextEditor.edit((editBuilder) => {
      this.killRing.backward();
      const prevText = this.killRing.top();
      editBuilder.replace(this.killRing.getLastRange(), prevText);
      this.saveClipboard(prevText);
    }).then(() => {
      const textRange = new vscode.Range(oldInsertionPoint, vscode.window.activeTextEditor.selection.end);
      this.killRing.setLastInsertedRange(textRange);
      vscode.window.activeTextEditor.selection = new vscode.Selection(textRange.start, textRange.end);
    });
    return true;
  }

  public undo(): void {
    vscode.commands.executeCommand("undo");
  }

  public deleteBlankLines(): void {
    const doc = vscode.window.activeTextEditor.document;
    const promises = [];
    let selection = this.getSelection();
    let anchor = selection.anchor;
    let range = doc.lineAt(selection.start.line).range;
    let nextLine: vscode.Position;

    if (range.isEmpty) {
      range = this.getFirstBlankLine(range);
      anchor = range.start;
      nextLine = range.start;
    } else {
      nextLine = range.start.translate(1, 0);
    }
    selection = new vscode.Selection(nextLine, nextLine);
    vscode.window.activeTextEditor.selection = selection;
    for (let line = selection.start.line;
          line < doc.lineCount - 1  && doc.lineAt(line).range.isEmpty;
          ++line) {
        promises.push(vscode.commands.executeCommand("deleteRight"));
    }
    Promise.all(promises).then(() => {
        vscode.window.activeTextEditor.selection = new vscode.Selection(anchor, anchor);
    });
  }

  public setRMode(): void {
    this.status.deactivate(Mode.RectangleMark);
    this.status.activate(Mode.Register);
  }

  public copyRectangle(): void {
    const selections = vscode.window.activeTextEditor.selections;
    let str = "";

    for (const s of selections) {
      const lineText = vscode.window.activeTextEditor.document.getText(s);
      str += `${lineText}\n`;
    }

    this.lastRectangularKill = str;
  }

  public killRectangle(): void {
    const selections = vscode.window.activeTextEditor.selections;
    let str = "";
    const deletes: Array<Thenable<boolean>> = [];

    for (const s of selections) {
      const lineText = vscode.window.activeTextEditor.document.getText(s);
      str += `${lineText}\n`;
      const asRange: vscode.Range = new vscode.Range(s.start, s.end);

      deletes.push(this.delete(asRange));
    }

    this.lastRectangularKill = str;
    Promise.all(deletes).then((value: boolean[]) => {
      const allTrue = value.reduce((prev, curr) => prev && curr);
      if (allTrue) {
        this.status.setStatusBarMessage("Rectangle Saved!", 5000);
      } else {
        this.status.setStatusBarMessage("Error saving rectangle", 5000);
      }
    });
  }

  public yankRectangle(): void {
    if (!this.lastRectangularKill) {
      this.status.setStatusBarMessage("No rectangle has been saved", 4000);
      return;
    }

    vscode.window.activeTextEditor.edit((editBuilder) => {
      const currEditor = vscode.window.activeTextEditor;

      // more than one selection
      if (currEditor.selections.length > 1) {
        const rectKillAsLines = this.lastRectangularKill.split("\n");
        for (let i = 0; i < currEditor.selections.length; i++) {
          editBuilder.replace(currEditor.selections[i], rectKillAsLines[i]);
        }
      } else {
        editBuilder.replace(currEditor.selection, this.lastRectangularKill);
      }
    });
  }

  public onType(text: string): void {
    let fHandled = false;
    switch (this.status.keybindingProgressMode()) {
      case Mode.Register:
        switch (text) {
          // Rectangles
          case "r":
            this.copyRectangle();
            this.status.deactivate(Mode.RectangleMark);
            this.status.deactivate(Mode.Register);
            fHandled = true;
            break;

          case "k":
            this.killRectangle();
            this.status.deactivate(Mode.RectangleMark);
            this.status.deactivate(Mode.Register);
            fHandled = true;
            break;

          case "y":
            this.yankRectangle();
            this.status.deactivate(Mode.RectangleMark);
            this.status.deactivate(Mode.Register);
            fHandled = true;
            break;

          case "o":
            this.status.setStatusBarMessage("'C-x r o' (Open rectangle) is not supported.");
            this.status.deactivate(Mode.Register);
            fHandled = true;
            break;

          case "c":
            this.status.setStatusBarMessage("'C-x r c' (Blank out rectangle) is not supported.");
            this.status.deactivate(Mode.Register);
            fHandled = true;
            break;

          case "t":
            this.status.setStatusBarMessage("'C-x r t' (prefix each line with a string) is not supported.");
            this.status.toggleMode(Mode.Register);
            fHandled = true;
            break;

          // Registers
          case "s":
            this.status.setStatusBarPermanentMessage("Copy to register:");
            this.status.setKeybindingProgress(Mode.RegisterSave);
            fHandled = true;
            break;

          case "i":
            this.status.setStatusBarPermanentMessage("Insert register:");
            this.status.setKeybindingProgress(Mode.RegisterInsert);
            fHandled = true;
            break;

          default:
            break;
        }
        break;
      case Mode.RegisterSave:
        this.status.setStatusBarPermanentMessage("");
        this.SaveTextToRegister(text);
        this.status.deactivateTempModes();
        fHandled = true;
        break;

      case Mode.RegisterInsert:
        this.status.setStatusBarPermanentMessage("");
        this.RestoreTextFromRegister(text);
        this.status.deactivateTempModes();
        fHandled = true;
        break;
      case Mode.NoKeyBinding:
      default:
        this.status.deactivateTempModes();
        this.status.setStatusBarPermanentMessage("");
        break;
    }

    if (!fHandled) {
      // default input handling: pass control to VSCode
      vscode.commands.executeCommand("default:type", {
        text,
      });
    }
  }
  public SaveTextToRegister(registerName: string): void {
    if (null === registerName) {
      return;
    }
    const range: vscode.Range = this.getSelectionRange();
    if (range !== null) {
      const selectedText = vscode.window.activeTextEditor.document.getText(range);
      if (null !== selectedText) {
        this.register.saveTextToRegister(registerName, selectedText);
      }
    }
  }

  public RestoreTextFromRegister(registerName: string): void {
    this.status.deactivate(Mode.Mark);
    const fromRegister = this.register.getTextFromRegister(registerName);
    if (fromRegister !== null) {
      vscode.window.activeTextEditor.edit((editBuilder) => {
        editBuilder.insert(this.getSelection().active, fromRegister);
      });
    } else {
      this.status.setStatusBarMessage("Register does not contain text.");
    }
  }

  private isRegion = (): boolean => {
    const currRegion = vscode.window.activeTextEditor.selection;
    return !currRegion.start.isEqual(currRegion.end);
  }

  private killEndOfLine(killRepeated: boolean): void {
    const currentCursorPosition = vscode.window.activeTextEditor.selection.active;
    vscode.commands.executeCommand("emacs.cursorEnd")
    .then(() => {
      const newCursorPos = vscode.window.activeTextEditor.selection.active;
      const rangeTillEnd = new vscode.Range(currentCursorPosition, newCursorPos);
      if (rangeTillEnd.isEmpty) {
        vscode.commands.executeCommand("editor.action.deleteLines").then(() => {
          this.killRing.append("\n");
        });
      }

      return vscode.window.activeTextEditor.document.getText(rangeTillEnd);
    }).then((text: string) => {
      vscode.window.activeTextEditor.selection.active = currentCursorPosition;
      vscode.commands.executeCommand("deleteRight").then(() => {
        killRepeated ? this.killRing.append(text) : this.killRing.save(text);
      });
    });

    this.toggleMarkMode();
  }

  private killText(range: vscode.Range, killRepeated: boolean): void {
    const text = vscode.window.activeTextEditor.document.getText(range);
    const promises = [
      this.delete(range),
    ];

    Promise.all(promises).then(() => {
      this.status.deactivate(Mode.Mark);
      killRepeated ? this.killRing.append(text) : this.killRing.save(text);
    });
  }

  private delete(range: vscode.Range = null): Thenable<boolean> {
    if (range === null) {
      const start = new vscode.Position(0, 0);
      const doc = vscode.window.activeTextEditor.document;
      const end = doc.lineAt(doc.lineCount - 1).range.end;

      range = new vscode.Range(start, end);
    }
    return vscode.window.activeTextEditor.edit((editBuilder) => {
      editBuilder.delete(range);
    });
  }

  private getFirstBlankLine(range: vscode.Range): vscode.Range {
    const doc = vscode.window.activeTextEditor.document;

    if (range.start.line === 0) {
      return range;
    }
    range = doc.lineAt(range.start.line - 1).range;
    while (range.start.line > 0 && range.isEmpty) {
      range = doc.lineAt(range.start.line - 1).range;
    }
    if (range.isEmpty) {
      return range;
    } else {
      return doc.lineAt(range.start.line + 1).range;
    }
  }
}
