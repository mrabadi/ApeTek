#!/usr/bin/python3
"""Paste the real system clipboard into a disposable Writer document."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
import zipfile

NS = {
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'draw': 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'xlink': 'http://www.w3.org/1999/xlink',
    'svg': 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
}


def attribute(element, namespace, name, default=''):
    return element.get('{%s}%s' % (NS[namespace], name), default)


def inspect_odt(filename):
    with zipfile.ZipFile(filename) as archive:
        document = ET.fromstring(archive.read('content.xml'))
        paragraphs = document.findall('.//text:p', NS) + document.findall('.//text:h', NS)
        text = '\n'.join(''.join(paragraph.itertext()) for paragraph in paragraphs)
        if not text.strip():
            raise ValueError('Writer document contains no editable paragraph text; a flattened graphic is insufficient.')
        style_documents = [document]
        if 'styles.xml' in archive.namelist():
            style_documents.insert(0, ET.fromstring(archive.read('styles.xml')))
        styles = {
            attribute(style, 'style', 'name'): style
            for source in style_documents
            for style in source.findall('.//style:style', NS)
        }
        parents = {child: parent for parent in document.iter() for child in parent}

        paragraph_tags = ('{%s}p' % NS['text'], '{%s}h' % NS['text'])

        def paragraph_property(frame, property_name, default):
            paragraph = frame if frame.tag in paragraph_tags else parents.get(frame)
            while paragraph is not None and paragraph.tag not in ('{%s}p' % NS['text'], '{%s}h' % NS['text']):
                paragraph = parents.get(paragraph)
            name = attribute(paragraph, 'text', 'style-name') if paragraph is not None else ''
            visited = set()
            while name and name not in visited:
                visited.add(name)
                style = styles.get(name)
                if style is None:
                    break
                properties = style.find('style:paragraph-properties', NS)
                value = attribute(properties, 'fo', property_name) if properties is not None else ''
                if value:
                    return value
                name = attribute(style, 'style', 'parent-style-name')
            for source in style_documents:
                for style in source.findall('.//style:default-style', NS):
                    if attribute(style, 'style', 'family') == 'paragraph':
                        properties = style.find('style:paragraph-properties', NS)
                        value = attribute(properties, 'fo', property_name) if properties is not None else ''
                        if value:
                            return value
            return default

        list_paragraphs = []
        for item in document.findall('.//text:list-item', NS):
            depth = 0
            ancestor = parents.get(item)
            while ancestor is not None:
                depth += ancestor.tag == '{%s}list' % NS['text']
                ancestor = parents.get(ancestor)
            for index, paragraph in enumerate(child for child in item if child.tag in paragraph_tags):
                list_paragraphs.append({
                    'text': ''.join(paragraph.itertext()),
                    'depth': depth,
                    'paragraphIndex': index,
                    'lineHeight': paragraph_property(paragraph, 'line-height', '100%'),
                    'marginTop': paragraph_property(paragraph, 'margin-top', '0in'),
                    'marginBottom': paragraph_property(paragraph, 'margin-bottom', '0in'),
                })

        graphics = []
        for frame in document.findall('.//draw:frame', NS):
            image = frame.find('draw:image', NS)
            if image is None:
                continue
            reference = attribute(image, 'xlink', 'href')
            if not reference.startswith('Pictures/') or reference not in archive.namelist():
                raise ValueError('Writer graphic is linked rather than embedded: ' + reference)
            data = archive.read(reference)
            png = data.startswith(b'\x89PNG\r\n\x1a\n')
            png_width, png_height = struct.unpack('>II', data[16:24]) if png and len(data) >= 24 else (0, 0)
            properties = styles.get(attribute(frame, 'draw', 'style-name'))
            properties = properties.find('style:graphic-properties', NS) if properties is not None else None
            graphics.append({
                'path': reference,
                'png': png,
                'pngWidth': png_width,
                'pngHeight': png_height,
                'paragraphAlignment': {'start': 'left', 'end': 'right'}.get(
                    paragraph_property(frame, 'text-align', 'left'), paragraph_property(frame, 'text-align', 'left')),
                'lineHeight': paragraph_property(frame, 'line-height', '100%'),
                'paragraphMarginTop': paragraph_property(frame, 'margin-top', '0in'),
                'paragraphMarginBottom': paragraph_property(frame, 'margin-bottom', '0in'),
                'anchor': attribute(frame, 'text', 'anchor-type'),
                'width': attribute(frame, 'svg', 'width'),
                'height': attribute(frame, 'svg', 'height'),
                'verticalPosition': attribute(properties, 'style', 'vertical-pos') if properties is not None else '',
                'verticalRelative': attribute(properties, 'style', 'vertical-rel') if properties is not None else '',
            })
        png_count = sum(graphic['png'] for graphic in graphics)
        if not png_count:
            raise ValueError('Writer document contains no embedded PNG graphic for rendered equations.')
        return {
            'ok': True,
            'text': text,
            'headingCount': len(document.findall('.//text:h', NS)),
            'listCount': len(document.findall('.//text:list', NS)),
            'tableCount': len(document.findall('.//table:table', NS)),
            'embeddedPngCount': png_count,
            'asCharacterCount': sum(graphic['anchor'] == 'as-char' for graphic in graphics),
            'graphics': graphics,
            'listParagraphs': list_paragraphs,
        }


def paste_into_writer(output_directory, clipboard_marker=''):
    if not (os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')):
        raise ValueError('A graphical Linux session is required for the real system clipboard test.')
    try:
        import uno
        from com.sun.star.beans import PropertyValue
    except ImportError as error:
        raise ValueError('Run this script with /usr/bin/python3 and install python3-uno for LibreOffice.') from error
    executable = shutil.which('/usr/bin/libreoffice')
    if not executable:
        raise ValueError('/usr/bin/libreoffice was not found.')
    output_directory = Path(output_directory).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)

    def property_value(name, value):
        result = PropertyValue()
        result.Name, result.Value = name, value
        return result

    with tempfile.TemporaryDirectory(prefix='markdown-local-writer-profile-') as profile:
        connection = 'pipe,name=markdown_local_' + uuid.uuid4().hex
        log_path = output_directory / 'writer-process.log'
        with log_path.open('wb') as log:
            process = subprocess.Popen([
                executable,
                '-env:UserInstallation=' + Path(profile).as_uri(),
                '--nologo', '--nodefault', '--norestore', '--nofirststartwizard',
                '--accept=' + connection + ';urp;StarOffice.ComponentContext',
            ], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            desktop = document = None
            try:
                local_context = uno.getComponentContext()
                resolver = local_context.ServiceManager.createInstanceWithContext(
                    'com.sun.star.bridge.UnoUrlResolver', local_context)
                deadline = time.monotonic() + 25
                while True:
                    try:
                        context = resolver.resolve('uno:' + connection + ';urp;StarOffice.ComponentContext')
                        break
                    except Exception:
                        if process.poll() is not None or time.monotonic() > deadline:
                            raise ValueError('Disposable Writer did not start; inspect ' + str(log_path))
                        time.sleep(0.1)
                manager = context.ServiceManager
                desktop = manager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
                document = desktop.loadComponentFromURL('private:factory/swriter', '_blank', 0, (
                    property_value('Hidden', False),
                    property_value('ReadOnly', False),
                ))
                controller = document.getCurrentController()
                frame = controller.getFrame()
                window = frame.getContainerWindow()
                window.setVisible(True)
                window.toFront()
                dispatcher = manager.createInstanceWithContext('com.sun.star.frame.DispatchHelper', context)
                # This dispatch reads the native session clipboard. Do not replace it
                # with setContents(), insertDocumentFromURL(), or HTML file import.
                deadline = time.monotonic() + 8
                while True:
                    dispatcher.executeDispatch(frame, '.uno:Paste', '', 0, ())
                    pasted_text = document.getText().getString()
                    if pasted_text.strip():
                        if clipboard_marker and clipboard_marker not in pasted_text:
                            raise ValueError('Writer received stale clipboard text rather than the expected fixture.')
                        break
                    if time.monotonic() > deadline:
                        raise ValueError('Writer Paste produced no editable text from the native clipboard. Focus the source app before copying on Wayland.')
                    time.sleep(0.1)
                odt_path = output_directory / 'writer-paste.odt'
                pdf_path = output_directory / 'writer-paste.pdf'
                before_text = document.getText().getString()
                before_graphics = len(document.getGraphicObjects().getElementNames())
                before_tables = len(document.getTextTables().getElementNames())
                document.storeAsURL(odt_path.as_uri(), (
                    property_value('FilterName', 'writer8'),
                    property_value('Overwrite', True),
                ))
                document.close(True)
                document = None
                document = desktop.loadComponentFromURL(odt_path.as_uri(), '_blank', 0, (
                    property_value('Hidden', False),
                    property_value('ReadOnly', False),
                ))
                if document is None:
                    raise ValueError('Writer could not reopen its saved ODT document.')
                round_trip = {
                    'editableTextMatches': document.getText().getString() == before_text,
                    'graphicCountBefore': before_graphics,
                    'graphicCountAfter': len(document.getGraphicObjects().getElementNames()),
                    'tableCountBefore': before_tables,
                    'tableCountAfter': len(document.getTextTables().getElementNames()),
                }
                if (not round_trip['editableTextMatches']
                        or round_trip['graphicCountAfter'] != before_graphics
                        or round_trip['tableCountAfter'] != before_tables):
                    raise ValueError('Writer changed editable text, graphics, or tables after saving and reopening the ODT.')
                # Export the reopened component so visual proof also exercises persistence.
                document.storeToURL(pdf_path.as_uri(), (
                    property_value('FilterName', 'writer_pdf_Export'),
                    property_value('Overwrite', True),
                ))
                report = inspect_odt(odt_path)
                report.update({'odt': str(odt_path), 'pdf': str(pdf_path), 'roundTrip': round_trip})
                (output_directory / 'writer-report.json').write_text(json.dumps(report, indent=2) + '\n')
                return report
            finally:
                if document is not None:
                    try:
                        document.close(True)
                    except Exception:
                        pass
                if desktop is not None:
                    try:
                        desktop.terminate()
                    except Exception:
                        pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        process.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect-odt')
    parser.add_argument('--output-dir')
    parser.add_argument('--clipboard-marker', default='', help='Require this text in the document pasted from the native clipboard.')
    args = parser.parse_args()
    if bool(args.inspect_odt) == bool(args.output_dir):
        parser.error('Supply exactly one of --inspect-odt or --output-dir.')
    report = inspect_odt(args.inspect_odt) if args.inspect_odt else paste_into_writer(args.output_dir, args.clipboard_marker)
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ET.ParseError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
