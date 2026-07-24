/**
 * frmFirma.js
 * Interfaz nativa en ExtJS para la Firma Electrónica en SISSOL.
 */
Ext.util.CSS.createStyleSheet(
    '.sissol-firma-win .x-window-header-text { color: #333 !important; font-weight: normal !important; } ' +
    '.sissol-firma-tabs .x-tab-strip span.x-tab-strip-text { color: #333 !important; font-weight: normal !important; } ' +
    '.sissol-firma-tabs .x-tab-strip-active span.x-tab-strip-text { font-weight: normal !important; } ' +
    '.sissol-firma-tabs .x-tab-strip .fas { color: #333 !important; }',
    'frmFirmaStyles'
);

var FrmFirma = Ext.extend(Ext.Window, {
    title: 'Sistema de Firma Electr\u00F3nica EEASA',
    width: 850,
    height: 580,
    layout: 'fit',
    modal: true,
    cls: 'sissol-firma-win',
    codigoTarea: null,
    
    constructor: function(config) {
        if (typeof config === 'string' || typeof config === 'number') {
            this.codigoTarea = config;
            config = {};
        } else if (config && config.codigoTarea) {
            this.codigoTarea = config.codigoTarea;
        }
        FrmFirma.superclass.constructor.call(this, config);
    },

    initComponent: function() {
        var me = this;

        // Store de Adjuntos para los ComboBox
        var storeAdjuntos = new Ext.data.JsonStore({
            fields: ['ID', 'NOMBRE'],
            data: []
        });

        var storeAdjuntosVerificar = new Ext.data.JsonStore({
            fields: ['ID', 'NOMBRE'],
            data: []
        });

                  var syncComboEstado = function() {
              var combo = Ext.getCmp('comboAdjuntosVerificar');
              var btn = Ext.getCmp('btnVerificarAddAll');
              if (!combo) return;
              var count = storeAdjuntosVerificar.getCount();
              
              if (count === 0) {
                  combo.emptyText = 'No hay documentos disponibles';
                  if (btn) btn.setDisabled(true);
              } else {
                  combo.emptyText = 'Seleccione un documento adjunto';
                  if (btn) btn.setDisabled(false);
              }
              
              combo.clearValue();
              if (combo.rendered) {
                  combo.setRawValue(combo.emptyText);
                  combo.el.addClass(combo.emptyClass);
              }
          };

          var recargarAdjuntosCombo = function() {
            if (me.isTemporal) {
                if (me.listaAdjuntos && me.listaAdjuntos.length > 0) {
                    storeAdjuntos.loadData(me.listaAdjuntos);
                    var grdStore = grdVerificar ? grdVerificar.getStore() : null;
                      var filteredVerificar = [];
                      for (var k = 0; k < me.listaAdjuntos.length; k++) {
                          var idCheck = me.listaAdjuntos[k].ID;
                          var inGrid = false;
                          if (grdStore) {
                              for (var r = 0; r < grdStore.getCount(); r++) {
                                  if (grdStore.getAt(r).get('idAdjunto') === idCheck) {
                                      inGrid = true;
                                      break;
                                  }
                              }
                          }
                          if (!inGrid) {
                              filteredVerificar.push(me.listaAdjuntos[k]);
                          }
                      }
                      storeAdjuntosVerificar.loadData(filteredVerificar);
                      syncComboEstado();
                  
                }
            } else if (me.codigoTarea) {
                try {
                    var adjuntos = getDatosAttachments(new getUserSessionData().Usuario(), me.codigoTarea);
                    var pdfs = [];
                    for (var i = 0; i < adjuntos.length; i++) {
                        if (adjuntos[i].ETAD_NOMBRE.toLowerCase().indexOf('.pdf') !== -1) {
                            pdfs.push({
                                ID: adjuntos[i].ETAD_ID,
                                NOMBRE: adjuntos[i].ETAD_NOMBRE
                            });
                        }
                    }
                    storeAdjuntos.loadData(pdfs);
                    var grdStore = grdVerificar ? grdVerificar.getStore() : null;
                      var filteredVerificar = [];
                      for (var k = 0; k < pdfs.length; k++) {
                          var idCheck = pdfs[k].ID;
                          var inGrid = false;
                          if (grdStore) {
                              for (var r = 0; r < grdStore.getCount(); r++) {
                                  if (grdStore.getAt(r).get('idAdjunto') === idCheck) {
                                      inGrid = true;
                                      break;
                                  }
                              }
                          }
                          if (!inGrid) {
                              filteredVerificar.push(pdfs[k]);
                          }
                      }
                      storeAdjuntosVerificar.loadData(filteredVerificar);
                      syncComboEstado();
                } catch(e) {
                    // Silently ignore if not in main app context
                }
            }
        };

        // Cargar por primera vez
        recargarAdjuntosCombo();

        me.p12Base64 = localStorage.getItem('firmaec_p12') || null;
        me.p12Name = localStorage.getItem('firmaec_p12_name') || null;
        me.subjectDN = localStorage.getItem('firmaec_subject') || 'Usuario';
        me.qrPreview = localStorage.getItem('firmaec_qr') || null;

        var extractName = function(dn) {
            if (!dn) return 'Usuario';
            var match = dn.match(/CN=([^,]+)/);
            return match ? match[1] : dn;
        };
        me.cleanName = extractName(me.subjectDN);

        me.pdfBase64 = null;
        me.pdfName = null;

        var openFileDialog = function(accept, callback) {
            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = accept;
            fileInput.onchange = function(e) {
                var file = e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function(evt) {
                    var base64Data = evt.target.result.split(',')[1];
                    callback(file.name, base64Data);
                };
                reader.readAsDataURL(file);
            };
            fileInput.click();
        };

        var updateCertState = function() {
            if (me.p12Base64) {
                lblCertAlmacenado.setValue('Cargado en memoria: ' + me.p12Name);
                btnCargarNuevoCert.setVisible(false);
                btnBorrarCert.setVisible(true);
                // Mostrar datos del certificado en resultados si no hay texto ya
                if (!txtResultado.getValue || !txtResultado.getValue()) {
                    var emisor = localStorage.getItem('firmaec_emisor') || '';
                    var cedula = localStorage.getItem('firmaec_cedula') || '';
                    var nombres = localStorage.getItem('firmaec_nombres') || '';
                    var apellidos = localStorage.getItem('firmaec_apellidos') || '';
                    var validFrom = localStorage.getItem('firmaec_validFrom') || '';
                    var validTo = localStorage.getItem('firmaec_validTo') || '';
                    var expirado = localStorage.getItem('firmaec_expirado') || 'NO';
                    var revocado = localStorage.getItem('firmaec_revocado') || 'NO';
                    
                    var texto = "Certificado V\u00E1lido y Guardado en Memoria!\n\n" +
                                "Certificado Emitido por: " + (emisor || me.subjectDN) + "\n" +
                                "C\u00E9dula: " + (cedula || 'N/A') + "\n" +
                                "Nombres: " + (nombres || 'N/A') + "\n" +
                                "Apellidos: " + (apellidos || 'N/A') + "\n" +
                                "Fecha de Emisi\u00F3n: " + (validFrom || 'N/A') + "\n" +
                                "Fecha de Expiraci\u00F3n: " + (validTo || 'N/A') + "\n" +
                                "Expirado: " + expirado + "\n" +
                                "Revocado: " + revocado;
                    txtResultado.setValue(texto);
                }
            } else {
                lblCertAlmacenado.setValue('Ning\u00FAn certificado en memoria');
                btnCargarNuevoCert.setVisible(true);
                btnBorrarCert.setVisible(false);
            }
        };

        // --- PESTAÑA 1: FIRMAR DOCUMENTO ---
        var lblDocFirmar = new Ext.form.DisplayField({
            fieldLabel: 'Documento a firmar',
            value: '(No se ha seleccionado documento)'
        });
        var lblCertAlmacenado = new Ext.form.DisplayField({
            fieldLabel: 'Certificado actual',
            value: ''
        });

        var txtPasswordFirma = new Ext.form.TextField({
            inputType: 'text',
            fieldLabel: 'Contrase\u00F1a de Firma',
            anchor: '-20',
            height: 28,
            emptyText: 'Ingrese la clave para estampar su firma...',
            style: 'font-size: 14px; margin-top: 15px; margin-bottom: 15px; -webkit-text-security: disc; -moz-text-security: disc; text-security: disc;',
            autoCreate: {tag: 'input', type: 'text', autocomplete: 'off', size: '20'},
            enableKeyEvents: true,
            listeners: {
                render: function(field) {
                    field.el.dom.setAttribute('autocomplete', 'off');
                    field.el.dom.setAttribute('data-form-type', 'other');
                    field.el.dom.setAttribute('data-lpignore', 'true');
                    field.el.dom.style.webkitTextSecurity = 'disc';
                },
                specialkey: function(field, e) {
                    if (e.getKey() === e.ENTER) {
                        doEstamparFirma();
                    }
                }
            }
        });

        // ================= VISOR PDF =================
        var abrirVisorPDF = function(pdfBase64, password) {
            var pdfDoc = null;
            var pageNum = 1;
            var pageRendering = false;
            var pageNumPending = null;
            var currentScale = 1.0;
            var isStampMode = false;

            // Construir el HTML del tracker con el QR real del certificado
            var qrImgSrc = me.qrPreview ? ('data:image/png;base64,' + me.qrPreview) : '';
            var trackerHtml = '';
            if (qrImgSrc) {
                trackerHtml = '<table style="font-size:7px; color:#000; margin:0; padding:0; line-height:1.1; font-family:Courier New,Courier,monospace;">' +
                    '<tr><td style="vertical-align:middle; padding-right:3px;">' +
                    '<img src="' + qrImgSrc + '" width="50" height="50" style="display:block;" />' +
                    '</td><td style="vertical-align:middle; white-space:nowrap;">' +
                    'Validar \u00FAnicamente en FirmaEC.<br>' +
                    'Firmado electr\u00F3nicamente por:<br>' +
                    '<span style="font-size:9px; font-weight:bold;">' + me.cleanName.toUpperCase() + '</span>' +
                    '</td></tr></table>';
            } else {
                trackerHtml = '<table style="font-size:7px; color:#000; margin:0; padding:0; line-height:1.1; font-family:Courier New,Courier,monospace;">' +
                    '<tr><td style="vertical-align:middle; white-space:nowrap;">' +
                    'Firmado electr\u00F3nicamente por:<br>' +
                    '<span style="font-size:9px; font-weight:bold;">' + me.cleanName.toUpperCase() + '</span>' +
                    '</td></tr></table>';
            }            var winVisor = new Ext.Window({
                title: 'Seleccionar Posici\u00F3n de Firma',
                width: 850,
                height: 750,
                layout: 'fit',
                modal: true,
                autoScroll: true,
                maximized: false,
                bodyStyle: 'background-color: #525659; text-align:center; position:relative; overflow:auto;',
                html: '<canvas id="pdf-canvas" style="border:1px solid #000; direction: ltr; margin: 10px auto; display: block; box-shadow: 0px 4px 10px rgba(0,0,0,0.5);"></canvas>' +
                      '<div id="qr-tracker" style="display:none; position:absolute; pointer-events:none; background:transparent; padding:0; z-index:9999;">' +
                      trackerHtml +
                      '</div>',
                tbar: [
                    {
                        text: '<i class="fas fa-chevron-left"></i> Anterior',
                        id: 'btnPrevPage',
                        disabled: true,
                        handler: function() {
                            if (pageNum <= 1) return;
                            pageNum--;
                            queueRenderPage(pageNum);
                        }
                    },
                    '-',
                    {
                        xtype: 'displayfield',
                        id: 'lblPageCount',
                        value: 'P\u00E1gina 1 de ?',
                        style: 'margin: 0 10px;'
                    },
                    '-',
                    {
                        text: 'Siguiente <i class="fas fa-chevron-right"></i>',
                        id: 'btnNextPage',
                        disabled: true,
                        handler: function() {
                            if (pageNum >= pdfDoc.numPages) return;
                            pageNum++;
                            queueRenderPage(pageNum);
                        }
                    },
                    '->',
                    {
                        text: '<span style="font-size:12px;"><i class="fas fa-stamp"></i> Ubicar Firma</span>',
                        enableToggle: true,
                        id: 'btnUbicarFirma',
                        toggleHandler: function(btn, state) {
                            isStampMode = state;
                            var canvas = document.getElementById('pdf-canvas');
                            var tracker = document.getElementById('qr-tracker');
                            if (state) {
                                canvas.style.cursor = 'none';
                                tracker.style.display = 'block';
                            } else {
                                canvas.style.cursor = 'default';
                                if (!winVisor.signaturePlaced) tracker.style.display = 'none';
                            }
                        }
                    },
                    {
                        text: '<span style="font-size:12px; color:#000;"><i class="fas fa-check"></i> Confirmar</span>',
                        id: 'btnConfirmarFirma',
                        hidden: true,
                        handler: function() {
                            Ext.Msg.confirm('Confirmar', '\u00BFEst\u00E1 seguro de estampar la firma en esta posici\u00F3n de la p\u00E1gina ' + winVisor.selectedPageNum + '?', function(btn) {
                                if (btn == 'yes') {
                                    winVisor.close();
                                    ejecutarFirmaCentralizada(password, winVisor.selectedPageNum, winVisor.selectedPdfX, winVisor.selectedPdfY);
                                }
                            });
                        }
                    },
                    {
                        text: '<span style="font-size:12px; color:#000;"><i class="fas fa-times"></i> Cancelar</span>',
                        id: 'btnReubicarFirma',
                        hidden: true,
                        handler: function() {
                            winVisor.signaturePlaced = false;
                            isStampMode = false;
                            Ext.getCmp('btnConfirmarFirma').hide();
                            Ext.getCmp('btnReubicarFirma').hide();
                            Ext.getCmp('btnUbicarFirma').show();
                            Ext.getCmp('btnUbicarFirma').toggle(false);
                            document.getElementById('qr-tracker').style.display = 'none';
                        }
                    }
                ],
                listeners: {
                    afterrender: function() {
                        Ext.getBody().mask('Cargando PDF...', 'x-mask-loading');
                        var pdfData = atob(pdfBase64);
                        var loadingTask = pdfjsLib.getDocument({data: pdfData});
                        loadingTask.promise.then(function(pdf) {
                            pdfDoc = pdf;
                            Ext.getCmp('lblPageCount').setValue('P\u00E1gina ' + pageNum + ' de ' + pdfDoc.numPages);
                            
                            if (pdfDoc.numPages > 1) {
                                Ext.getCmp('btnNextPage').setDisabled(false);
                            }
                            
                            renderPage(pageNum);
                            
                            var canvas = document.getElementById('pdf-canvas');
                            var tracker = document.getElementById('qr-tracker');
                            var container = winVisor.body.dom;
                            
                            container.addEventListener('mousemove', function(e) {
                                if (!isStampMode) return;
                                var rect = container.getBoundingClientRect();
                                var x = e.clientX - rect.left + container.scrollLeft;
                                var y = e.clientY - rect.top + container.scrollTop;
                                tracker.style.left = x + 'px';
                                tracker.style.top = y + 'px';
                            });

                            canvas.addEventListener('click', function(e) {
                                if (!isStampMode) return; // Si no esta ubicando firma, se permite clics normales sin alertas

                                var rect = canvas.getBoundingClientRect();
                                var x = e.clientX - rect.left;
                                var y = e.clientY - rect.top;

                                var pdfX = x / currentScale;
                                var pdfY = y / currentScale;

                                pdfDoc.getPage(pageNum).then(function(page) {
                                    var originalViewport = page.getViewport({scale: 1.0});
                                    
                                    // El alto de la firma en backend ahora es ~38.
                                    // Bajar 45 (poco menos que antes) y derecha 4 (poco menos que antes)
                                    var invertedY = originalViewport.height - pdfY - 45;
                                    var finalPdfX = pdfX + 4;

                                    winVisor.selectedPageNum = pageNum;
                                    winVisor.selectedPdfX = Math.round(finalPdfX);
                                    winVisor.selectedPdfY = Math.round(invertedY);
                                    winVisor.signaturePlaced = true;

                                    // Detener el modo seguimiento
                                    Ext.getCmp('btnUbicarFirma').toggle(false);
                                    Ext.getCmp('btnUbicarFirma').hide();
                                    
                                    // Mostrar botones de confirmar/reubicar
                                    Ext.getCmp('btnConfirmarFirma').show();
                                    Ext.getCmp('btnReubicarFirma').show();
                                });
                            });

                        }, function(reason) {
                            Ext.getBody().unmask();
                            Ext.Msg.alert('Error', 'No se pudo renderizar el PDF: ' + reason);
                        });
                    }
                }
            });

            function renderPage(num) {
                pageRendering = true;
                Ext.getBody().mask('Renderizando p\u00E1gina...', 'x-mask-loading');
                pdfDoc.getPage(num).then(function(page) {
                    var scale = 1.0; 
                    var viewport = page.getViewport({scale: scale});

                    var desiredWidth = winVisor.body.getWidth() - 60;
                    scale = desiredWidth / viewport.width;
                    currentScale = scale;
                    viewport = page.getViewport({scale: scale});

                    var canvas = document.getElementById('pdf-canvas');
                    var context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    var renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    var renderTask = page.render(renderContext);

                    renderTask.promise.then(function() {
                        pageRendering = false;
                        Ext.getBody().unmask();
                        if (pageNumPending !== null) {
                            renderPage(pageNumPending);
                            pageNumPending = null;
                        }
                    });
                });

                Ext.getCmp('lblPageCount').setValue('P\u00E1gina ' + num + ' de ' + pdfDoc.numPages);
                Ext.getCmp('btnPrevPage').setDisabled(num <= 1);
                Ext.getCmp('btnNextPage').setDisabled(num >= pdfDoc.numPages);
            }

            function queueRenderPage(num) {
                if (pageRendering) {
                    pageNumPending = num;
                } else {
                    renderPage(num);
                }
            }

            winVisor.show();
        };

        var ejecutarFirmaCentralizada = function(password, pagina, posX, posY) {
            Ext.getBody().mask('Firmando documento...', 'x-mask-loading');
            
            var payload = {
                pdfBase64: me.pdfBase64,
                p12Base64: me.p12Base64,
                password: password,
                pagina: pagina,
                posX: posX,
                posY: posY
            };
            
            if (me.isTemporal) {
                  payload.idAdjunto = me.currentAdjuntoId;
                  if (!me.currentAdjuntoId) {
                      payload.usuario = new getUserSessionData().Usuario();
                      payload.nombreDocumento = me.pdfName ? me.pdfName.replace('.pdf', '-signed.pdf') : 'DocumentoFirmado.pdf';
                  }
              } else if (me.codigoTarea) {
                payload.idTarea = me.codigoTarea;
                payload.usuario = new getUserSessionData().Usuario();
                payload.nombreDocumento = me.pdfName ? me.pdfName.replace('.pdf', '-signed.pdf') : 'DocumentoFirmado.pdf';
            }

            var firmaUrl = me.isTemporal ? '/sissolWS/rs/firma/firmar-temporal' : '/sissolWS/rs/firma/firmar';

            Ext.Ajax.request({
                url: firmaUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                jsonData: payload,
                success: function(response) {
                    Ext.getBody().unmask();
                    txtPasswordFirma.setValue('');
                    var resp = Ext.decode(response.responseText);
                    if (resp.pdfFirmado) {
                        var exitoMsg = '\u00A1Documento firmado exitosamente!';
                        if (me.isTemporal) {
                            exitoMsg += '<br><br>El documento temporal se ha guardado exitosamente.';
                            var signedName = me.pdfName ? me.pdfName.replace('.pdf', '-signed.pdf') : 'DocumentoFirmado.pdf';
                            if (typeof me.onFirmaExitosaTemporal === 'function' && resp.idAdjunto) {
                                try { me.onFirmaExitosaTemporal(resp.idAdjunto); } catch(e) { console.error('Error en callback onFirmaExitosaTemporal:', e); }
                            }
                            // Actualizar la lista interna de adjuntos con el nuevo documento
                            if (resp.idAdjunto) {
                                var yaExiste = false;
                                if (!me.listaAdjuntos) me.listaAdjuntos = [];
                                for (var la = 0; la < me.listaAdjuntos.length; la++) {
                                    if (String(me.listaAdjuntos[la].ID) === String(resp.idAdjunto)) {
                                        yaExiste = true;
                                        break;
                                    }
                                }
                                if (!yaExiste) {
                                    me.listaAdjuntos.push({
                                        ID: resp.idAdjunto,
                                        NOMBRE: signedName,
                                        ETAD_NOMBRE: signedName
                                    });
                                }
                            }
                            // Recargar los selectores del modal de firma
                            try { recargarAdjuntosCombo(); } catch(e) { console.error('Error recargando combos:', e); }
                        } else if (me.codigoTarea) {
                            exitoMsg += '<br><br>El documento se ha guardado autom\u00E1ticamente en los Adjuntos del Memo.';
                            
                            if (typeof me.callbackRefrescar === 'function') {
                                try {
                                    me.callbackRefrescar();
                                } catch(e) {}
                            } else {
                                // Intentar refrescar la grilla de adjuntos autom\u00E1ticamente si est\u00E1 visible y no vino callback
                                var gridAdjuntos = Ext.getCmp('gridTareaAdjuntos');
                                if (gridAdjuntos && typeof window.listarAdjuntos === 'function') {
                                    try { window.listarAdjuntos(me.codigoTarea); } catch(e) {}
                                }
                            }
                            
                            // Recargar el combobox de adjuntos del propio formulario de firma
                            try { recargarAdjuntosCombo(); } catch(e) {}
                        }
                        
                        Ext.Msg.show({
                            title: '\u00C9xito',
                            msg: exitoMsg,
                            buttons: Ext.Msg.OK,
                            icon: Ext.MessageBox.INFO
                        });
                        
                        var byteCharacters = atob(resp.pdfFirmado);
                        var byteNumbers = new Array(byteCharacters.length);
                        for (var i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        var byteArray = new Uint8Array(byteNumbers);
                        var blob = new Blob([byteArray], {type: 'application/pdf'});
                        var link = document.createElement('a');
                        link.href = window.URL.createObjectURL(blob);
                        link.download = me.pdfName ? me.pdfName.replace('.pdf', '-signed.pdf') : 'DocumentoFirmado.pdf';
                        link.click();

                    } else {
                        Ext.Msg.alert('Error', resp.error || 'No se pudo firmar.');
                    }
                },
                failure: function(response) {
                    Ext.getBody().unmask();
                    txtPasswordFirma.setValue('');
                    console.error('AJAX ERROR firmar:', response.status, response.statusText, response.responseText);
                    var errMsg = 'Error de comunicaci\u00F3n con el servidor al firmar. HTTP ' + response.status;
                    try {
                        var resp = Ext.decode(response.responseText);
                        if (resp && resp.error) errMsg = resp.error;
                    } catch(e) {}
                    Ext.Msg.alert('Error', errMsg);
                }
            });
        };

        var doEstamparFirma = function() {
            var pwd = txtPasswordFirma.getValue();
            if (!me.pdfBase64) {
                Ext.Msg.alert('Error', 'Seleccione un documento PDF a firmar.');
                return;
            }
            if (!me.p12Base64) {
                Ext.Msg.alert('Error', 'No hay ning\u00FAn certificado en memoria. Vaya a Validar Certificado primero.');
                return;
            }
            if (!pwd) {
                Ext.Msg.alert('Error', 'Debe ingresar la contrase\u00F1a de su certificado para firmar.');
                return;
            }
            
            Ext.getBody().mask('Validando contrase\u00F1a...', 'x-mask-loading');
            Ext.Ajax.request({
                url: '/sissolWS/rs/firma/validar-certificado',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                jsonData: {
                    p12Base64: me.p12Base64,
                    password: pwd
                },
                success: function(response) {
                    Ext.getBody().unmask();
                    var resp = Ext.decode(response.responseText);
                    if (resp.valido) {
                        abrirVisorPDF(me.pdfBase64, pwd);
                    } else {
                        Ext.Msg.show({
                            title: 'Contrase\u00F1a Incorrecta',
                            msg: 'La contrase\u00F1a del certificado no es v\u00E1lida.<br>Por favor, revise su contrase\u00F1a e intente nuevamente.',
                            buttons: Ext.Msg.OK,
                            icon: Ext.MessageBox.ERROR
                        });
                    }
                },
                failure: function(response) {
                    Ext.getBody().unmask();
                    Ext.Msg.alert('Error', 'Fallo de conexi\u00F3n al validar certificado.');
                }
            });
        };

        var pnlFirmar = new Ext.FormPanel({
            title: '<span style="font-size: 13px; padding: 1px;"><i class="fas fa-pen-nib"></i> Firmar Documento</span>',
            frame: false,
            border: false,
            bodyStyle: 'padding:20px; background-color: #fff;',
            items: [
                {
                    layout: 'column',
                    border: false,
                    style: 'margin-bottom: 20px;',
                    items: [
                        {
                            columnWidth: 0.5,
                            layout: 'anchor',
                            border: false,
                            style: 'padding-right: 2px;',
                            items: [{
                                xtype: 'button',
                                anchor: '100%',
                                height: 80,
                                text: '<table style="width:100%;"><tr>' +
                                      '<td style="width:30%; text-align:right; padding-right:15px;"><i class="fas fa-file-alt fa-3x" style="color: #636a97;"></i></td>' +
                                      '<td style="text-align:left; padding-left: 5px;">' +
                                      '<span style="font-size: 13px;">Subir Documento</span><br>' +
                                      '<span style="font-size: 11px;">Desde tu PC</span>' +
                                      '</td></tr></table>',
                                handler: function() {
                                    openFileDialog('.pdf', function(name, base64) {
                                        me.pdfBase64 = base64;
                                        me.pdfName = name;
                                        lblDocFirmar.setValue(name);
                                    });
                                },
                                listeners: {
                                    afterrender: function(btn) {
                                        var el = btn.getEl().dom;
                                        el.addEventListener('dragover', function(e) {
                                            e.stopPropagation(); e.preventDefault();
                                            e.dataTransfer.dropEffect = 'copy';
                                            el.style.opacity = '0.7';
                                        });
                                        el.addEventListener('dragleave', function(e) {
                                            e.stopPropagation(); e.preventDefault();
                                            el.style.opacity = '1';
                                        });
                                        el.addEventListener('drop', function(e) {
                                            e.stopPropagation(); e.preventDefault();
                                            el.style.opacity = '1';
                                            var file = e.dataTransfer.files[0];
                                            if (file && file.name.toLowerCase().indexOf('.pdf') > -1) {
                                                var reader = new FileReader();
                                                reader.onload = function(evt) {
                                                    me.pdfBase64 = evt.target.result.split(',')[1];
                                                    me.pdfName = file.name;
                                                    lblDocFirmar.setValue(file.name);
                                                };
                                                reader.readAsDataURL(file);
                                            } else {
                                                Ext.Msg.alert('Error', 'Por favor, arrastre un archivo PDF v\u00E1lido.');
                                            }
                                        });
                                    }
                                }
                            }]
                        },
                        {
                            columnWidth: 0.5,
                            layout: 'anchor',
                            border: false,
                            style: 'padding-left: 2px;',
                            items: [{
                                xtype: 'panel',
                                anchor: '100%',
                                height: 80,
                                border: true,
                                bodyStyle: 'background-color:#f9f9f9; padding: 15px;',
                                layout: 'form',
                                hideLabels: true,
                                items: [
                                    {
                                        xtype: 'displayfield',
                                        value: '<span style="font-size:13px; font-weight:bold; color:#555;"><i class="fas fa-paperclip"></i> Adjuntos del Memo (.pdf)</span>',
                                        style: 'margin-bottom: 5px;'
                                    },
                                    {
                                        xtype: 'combo',
                                        store: storeAdjuntos,
                                        displayField: 'NOMBRE',
                                        valueField: 'ID',
                                        mode: 'local',
                                        triggerAction: 'all',
                                        emptyText: 'Seleccione un documento adjunto',
                                        editable: true,
                                        typeAhead: true,
                                        minChars: 0,
                                        forceSelection: true,
                                        anchor: '-10',
                                        listEmptyText: '<div style="padding:6px 8px; color:#999; font-style:italic;">No hay documentos disponibles</div>',
                                        tpl: '<tpl for="."><div class="x-combo-list-item" style="white-space: normal; line-height: 1.2;">{NOMBRE}</div></tpl>',
                                        listeners: {
                                            select: function(combo, record) {
                                                Ext.getBody().mask('Cargando documento...', 'x-mask-loading');
                                                Ext.Ajax.request({
                                                    url: me.isTemporal ? '/sissolWS/rs/firma/adjunto-temporal-base64' : '/sissolWS/rs/firma/adjunto-base64',
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    jsonData: { idAdjunto: record.get('ID') },
                                                    success: function(resp) {
                                                        Ext.getBody().unmask();
                                                        var data = Ext.decode(resp.responseText);
                                                        if (data.pdfBase64) {
                                                            me.pdfBase64 = data.pdfBase64;
                                                            me.pdfName = record.get('NOMBRE');
                                                            me.currentAdjuntoId = record.get('ID');
                                                            lblDocFirmar.setValue(record.get('NOMBRE'));
                                                        } else {
                                                            Ext.Msg.alert('Error', data.error || 'No se pudo cargar el PDF.');
                                                        }
                                                    },
                                                    failure: function(response) {
                                                        Ext.getBody().unmask();
                                                        console.error("AJAX ERROR adjunto-base64:", response.status, response.statusText, response.responseText);
                                                        Ext.Msg.alert('Error', 'Error al comunicarse con el servidor. HTTP ' + response.status + ' - ' + response.statusText);
                                                    }
                                                });
                                            }
                                        }
                                    }
                                ]
                            }]
                        }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Estado de Memoria',
                    autoHeight: true,
                    labelWidth: 150,
                    anchor: '-20',
                    style: 'padding: 15px; border: 1px solid #ddd;',
                    items: [ lblDocFirmar, lblCertAlmacenado ]
                },
                txtPasswordFirma
            ],
            buttons: [
                {
                    text: '<span style="font-size:12px; padding: 0 10px;"><i class="fas fa-pen-nib"></i> Estampar Firma</span>',
                    height: 28,
                    handler: doEstamparFirma
                }
            ]
        });

        // --- PESTAÑA 2: VERIFICAR DOCUMENTO ---
        var grdVerificar = new Ext.grid.GridPanel({
            title: '<span style="font-size: 13px; padding: 1px;"><i class="fas fa-check-double"></i> Verificar Documento</span>',
            frame: false,
            border: false,
            columnLines: true,
            stripeRows: true,
            store: new Ext.data.ArrayStore({
                fields: ['idAdjunto', 'documento', 'base64', 'estadoCode', 'detalleMsg', 'detalleData']
            }),
            columns: [
                {
                    header: 'Documento', 
                    dataIndex: 'documento', 
                    width: 250,
                    renderer: function(v) { return '<div style="white-space: normal;">' + (v || '') + '</div>'; }
                },
                {
                    header: 'Abrir', 
                    width: 50, 
                    align: 'center',
                    renderer: function(val, meta, record) {
                        return '<a href="#" class="btn-abrir"><i class="fas fa-search" style="font-size:16px; color:#333; cursor:pointer;"></i></a>';
                    }
                },
                {
                    header: 'Quitar', 
                    width: 50, 
                    align: 'center',
                    renderer: function(val, meta, record) {
                        return '<a href="#" class="btn-quitar"><i class="fas fa-trash" style="font-size:16px; color:#d9534f; cursor:pointer;"></i></a>';
                    }
                },
                {
                    header: 'Estado', 
                    width: 60, 
                    align: 'center',
                    renderer: function(val, meta, record) {
                        var st = record.get('estadoCode');
                        if (st === 1) return '<i class="fas fa-check" style="color:green; font-size:18px;"></i>';
                        if (st === 2) return '<i class="fas fa-times" style="color:red; font-size:18px;"></i>';
                        return '';
                    }
                },
                {
                    header: 'Detalle', 
                    width: 60, 
                    align: 'center',
                    renderer: function(val, meta, record) {
                        var msg = record.get('detalleMsg');
                        if (msg) {
                            return '<i class="fas fa-info-circle" style="font-size:18px; color:#5bc0de; cursor:pointer;" title="' + Ext.util.Format.htmlEncode(msg).replace(/"/g, '&quot;') + '"></i>';
                        }
                        return '';
                    }
                }
            ],
            viewConfig: {
                forceFit: true,
                emptyText: 'No hay documentos para verificar'
            },
            listeners: {
                cellclick: function(grid, rowIndex, colIndex, e) {
                    var record = grid.getStore().getAt(rowIndex);
                    var header = grid.getColumnModel().getColumnHeader(colIndex);
                    if (header === 'Abrir') {
                        var byteCharacters = atob(record.get('base64'));
                        var byteNumbers = new Array(byteCharacters.length);
                        for (var i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        var byteArray = new Uint8Array(byteNumbers);
                        var blob = new Blob([byteArray], {type: "application/pdf"});
                        window.open(window.URL.createObjectURL(blob));
                    } else if (header === 'Quitar') {
                        var idAdj = record.get('idAdjunto');
                        var nombreDoc = record.get('documento');
                        grid.getStore().remove(record);
                        if (idAdj) {
                            var comboRec = new Ext.data.Record({
                                ID: idAdj,
                                NOMBRE: nombreDoc
                            });
                            storeAdjuntosVerificar.add(comboRec);
                        }
                        syncComboEstado();
                    } else if (header === 'Detalle') {
                        var firmantes = record.get('detalleData');
                        if (firmantes && firmantes.length > 0) {
                            var storeFirmantes = new Ext.data.JsonStore({
                                fields: [
                                    'cedula', 'nombre', 'razon', 'localizacion', 'fechaFirmado', 
                                    'entidadCertificadora', 'fechaEmision', 'fechaExpiracion', 
                                    'fechaRevocacion', 'selladoTiempo', 'valido'
                                ],
                                data: firmantes
                            });
                            
                            var wrapRender = function(v) { return '<div style="white-space: normal; padding: 5px 0;">' + (v || '') + '</div>'; };
                            var dateRender = function(v) { 
                                if (v) v = v.replace(' hora de Ecuador', '<br>hora de Ecuador');
                                return '<div style="white-space: normal; padding: 5px 0;">' + (v || '') + '</div>'; 
                            };

                            var gridFirmantes = new Ext.grid.GridPanel({
                                store: storeFirmantes,
                                columnLines: true,
                                stripeRows: true,
                                border: false,
                                columns: [
                                    {
                                        header: 'C\u00E9dula de Identidad /<br>Nombres y Apellidos', 
                                        width: 160, 
                                        renderer: function(v, m, r){ 
                                            var cedulaFull = r.get('cedula') || '';
                                            var cedulaParts = cedulaFull.split('-');
                                            var cedula = cedulaParts[0].trim();
                                            
                                            var nombreFull = r.get('nombre') || '';
                                            var n = nombreFull.trim().split(' ').filter(function(w){ return w.length > 0; });
                                            var nom = '', ape = '';
                                            
                                            if (n.length >= 4) {
                                                nom = n[0] + ' ' + n[1];
                                                ape = n.slice(2).join(' ');
                                            } else if (n.length === 3) {
                                                nom = n[0];
                                                ape = n[1] + ' ' + n[2];
                                            } else {
                                                nom = nombreFull;
                                            }
                                            
                                            var h = '<b>' + cedula + '</b><br>' + nom;
                                            if (ape !== '') h += '<br>' + ape;
                                            return '<div style="white-space: normal; padding: 5px 0;">' + h + '</div>';
                                        }
                                    },
                                    {header: 'Raz\u00F3n /<br>Localizaci\u00F3n', width: 110, renderer: function(v, m, r){ return '<div style="white-space: normal; padding: 5px 0;">' + (r.get('razon')||'') + '<br>' + (r.get('localizacion')||'') + '</div>'; }},
                                    {header: 'Fecha de<br>Firmado', dataIndex: 'fechaFirmado', width: 120, renderer: dateRender},
                                    {header: 'Entidad<br>Certificadora', dataIndex: 'entidadCertificadora', width: 170, renderer: wrapRender},
                                    {header: 'Fecha de<br>Emisi\u00F3n', dataIndex: 'fechaEmision', width: 120, renderer: dateRender},
                                    {header: 'Fecha de<br>Expiraci\u00F3n', dataIndex: 'fechaExpiracion', width: 120, renderer: dateRender},
                                    {header: 'Fecha de<br>Revocaci\u00F3n', dataIndex: 'fechaRevocacion', width: 110, renderer: wrapRender},
                                    {header: 'Sellado de<br>Tiempo', dataIndex: 'selladoTiempo', width: 100, renderer: wrapRender},
                                    {header: 'V\u00E1lido', width: 80, align:'center', renderer: function(v, m, r){ return '<div style="white-space: normal; padding: 5px 0; text-align: center;">' + (r.get('valido') ? '<i class="fas fa-check" style="color:green; font-size:16px;"></i>' : '<i class="fas fa-times" style="color:red; font-size:16px;"></i>') + '</div>'; }}
                                ],
                                viewConfig: { forceFit: false }
                            });
                            
                            var winDetalle = new Ext.Window({
                                title: '<i class="fas fa-info-circle"></i> Firmantes',
                                width: 1100,
                                height: 650,
                                layout: 'border',
                                modal: true,
                                items: [
                                    {
                                        region: 'north',
                                        height: 60,
                                        bodyStyle: 'padding:10px; background-color:#fff;',
                                        border: false,
                                        html: '<div style="font-size:12px;"><b>Total de firmantes:</b> ' + firmantes.length + '<br>' +
                                              '<b>Documento:</b> <span style="color:blue;">' + record.get('documento') + '</span></div>'
                                    },
                                    {
                                        region: 'center',
                                        layout: 'fit',
                                        border: true,
                                        items: [gridFirmantes]
                                    }
                                ],
                                buttons: [{ text: 'Salir', handler: function(){ winDetalle.close(); } }]
                            });
                            winDetalle.show();
                        } else {
                            var msg = record.get('detalleMsg');
                            if (msg) {
                                Ext.Msg.show({
                                    title: 'Detalle de Verificaci\u00F3n',
                                    msg: msg.replace(/\n/g, '<br/>'),
                                    buttons: Ext.Msg.OK,
                                    icon: Ext.MessageBox.INFO
                                });
                            }
                        }
                    }
                }
            },
            tbar: [
                { 
                    text: '<i class="fas fa-upload"></i> Subir Documento(s)',
                    handler: function() {
                        openFileDialog('.pdf', function(name, base64) {
                            var record = new Ext.data.Record({
                                documento: name,
                                base64: base64,
                                estadoCode: 0,
                                detalleMsg: ''
                            });
                            grdVerificar.getStore().add(record);
                        });
                    }
                },
                '-',
                {
                    xtype: 'label',
                    text: ' O seleccionar de Adjuntos: ',
                    style: 'margin-right: 5px; font-weight:bold; color:#555;'
                },
                {
                    xtype: 'combo',
                    id: 'comboAdjuntosVerificar',
                    store: storeAdjuntosVerificar,
                    displayField: 'NOMBRE',
                    valueField: 'ID',
                    mode: 'local',
                    triggerAction: 'all',
                    emptyText: 'Seleccione un documento adjunto',
                    editable: true,
                    typeAhead: true,
                    minChars: 0,
                    forceSelection: true,
                    width: 250,
                    listWidth: 350,
                    listEmptyText: '<div style="padding:6px 8px; color:#999; font-style:italic;">No hay documentos disponibles</div>',
                    tpl: '<tpl for="."><div class="x-combo-list-item" style="white-space: normal; line-height: 1.2;">{NOMBRE}</div></tpl>',
                    listeners: {
                        select: function(combo, record) {
                            var name = record.get('NOMBRE');
                            Ext.getBody().mask('Cargando documento...', 'x-mask-loading');
                            
                            var fetchUrl = me.isTemporal ? '/sissolWS/rs/firma/adjunto-temporal-base64' : '/sissolWS/rs/firma/adjunto-base64';
                            
                            Ext.Ajax.request({
                                url: fetchUrl,
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                jsonData: { idAdjunto: record.get('ID') },
                                success: function(resp) {
                                    Ext.getBody().unmask();
                                    var data = Ext.decode(resp.responseText);
                                    if (data.pdfBase64) {
                                        var newRec = new Ext.data.Record({
                                            idAdjunto: record.get('ID'),
                                            documento: name,
                                            base64: data.pdfBase64,
                                            estadoCode: 0,
                                            detalleMsg: ''
                                        });
                                        grdVerificar.getStore().add(newRec);
                                        
                                        // Remover de la lista y sincronizar estado del combo
                                        storeAdjuntosVerificar.remove(record);
                                        syncComboEstado();
                                    } else {
                                        Ext.Msg.alert('Error', data.error || 'No se pudo cargar.');
                                    }
                                },
                                failure: function() {
                                    Ext.getBody().unmask();
                                    Ext.Msg.alert('Error', 'Error de conexi\u00F3n.');
                                }
                            });
                        }
                    }
                },
                '-',
                {
                    xtype: 'button',
                    id: 'btnVerificarAddAll',
                    text: '<span style="font-size:11px; padding: 0 5px;"><i class="fas fa-list-check"></i> A\u00F1adir Todos</span>',
                    handler: function() {
                        var count = storeAdjuntosVerificar.getCount();
                        if (count === 0) return;
                        
                        Ext.getBody().mask('Cargando ' + count + ' documentos...', 'x-mask-loading');
                        
                        var index = 0;
                        var fetchUrl = me.isTemporal ? '/sissolWS/rs/firma/adjunto-temporal-base64' : '/sissolWS/rs/firma/adjunto-base64';
                        
                        var processNext = function() {
                            if (index >= count) {
                                Ext.getBody().unmask();
                                storeAdjuntosVerificar.removeAll();
                                syncComboEstado();
                                return;
                            }
                            
                            var record = storeAdjuntosVerificar.getAt(index);
                            var name = record.get('NOMBRE');
                            
                            Ext.Ajax.request({
                                url: fetchUrl,
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                jsonData: { idAdjunto: record.get('ID') },
                                success: function(resp) {
                                    var data = Ext.decode(resp.responseText);
                                    if (data.pdfBase64) {
                                        var newRec = new Ext.data.Record({
                                            idAdjunto: record.get('ID'),
                                            documento: name,
                                            base64: data.pdfBase64,
                                            estadoCode: 0,
                                            detalleMsg: ''
                                        });
                                        grdVerificar.getStore().add(newRec);
                                    }
                                    index++;
                                    processNext();
                                },
                                failure: function() {
                                    index++;
                                    processNext();
                                }
                            });
                        };
                        
                        processNext();
                    }
                }
            ],
            buttons: [
                {
                    text: '<span style="font-size:12px; padding: 0 10px;"><i class="fas fa-check-double"></i> Verificar Documentos</span>',
                    height: 28,
                    handler: function() {
                        var store = grdVerificar.getStore();
                        var total = store.getCount();
                        if (total === 0) return;
                        
                        var index = 0;
                        var checkNext = function() {
                            if (index >= total) {
                                Ext.Msg.alert('Fin', 'Verificaci\u00F3n terminada.');
                                grdVerificar.getView().refresh();
                                return;
                            }
                            var record = store.getAt(index);
                            if (record.get('estadoCode') !== 0) { // Ya verificado
                                index++;
                                checkNext();
                                return;
                            }
                            Ext.getBody().mask('Verificando ' + (index + 1) + ' de ' + total + '...', 'x-mask-loading');
                            Ext.Ajax.request({
                                url: '/sissolWS/rs/firma/verificar',
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                jsonData: { pdfBase64: record.get('base64') },
                                success: function(resp) {
                                    Ext.getBody().unmask();
                                    var data = Ext.decode(resp.responseText);
                                    if (data.tieneFirma) {
                                        record.set('estadoCode', 1);
                                        record.set('detalleMsg', 'Firmas V\u00E1lidas: ' + data.totalFirmantes + '. Haga clic para m\u00E1s detalles.');
                                        record.set('detalleData', data.firmantes);
                                    } else {
                                        record.set('estadoCode', 2);
                                        record.set('detalleMsg', 'Sin Firma Digital');
                                        record.set('detalleData', []);
                                    }
                                    record.commit();
                                    index++;
                                    checkNext();
                                },
                                failure: function() {
                                    Ext.getBody().unmask();
                                    record.set('estadoCode', 2);
                                    record.set('detalleMsg', 'Error de conexi\u00F3n');
                                    record.set('detalleData', []);
                                    record.commit();
                                    index++;
                                    checkNext();
                                }
                            });
                        };
                        checkNext();
                    }
                },
                { text: '<span style="font-size:12px; padding: 0 10px;"><i class="fas fa-redo"></i> Limpiar Tabla</span>', height: 28, handler: function(){ grdVerificar.getStore().removeAll(); } }
            ]
        });

        // --- PESTAÑA 3: VALIDAR CERTIFICADO ---
        var doValidarCertificado = function() {
            var pwd = txtPasswordVal.getValue();
            var certToValidate = tempP12Base64 || me.p12Base64;
            if (!certToValidate || !pwd) {
                Ext.Msg.alert('Aviso', 'Seleccione un certificado e ingrese la contrase\u00F1a.');
                return;
            }
            Ext.getBody().mask('Validando...', 'x-mask-loading');
            Ext.Ajax.request({
                url: '/sissolWS/rs/firma/validar-certificado',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                jsonData: {
                    p12Base64: certToValidate,
                    password: pwd
                },
                success: function(response) {
                    Ext.getBody().unmask();
                    txtPasswordVal.setValue('');
                    var resp = Ext.decode(response.responseText);
                    if (resp.valido) {
                        var certName = tempP12Name || me.p12Name;
                        localStorage.setItem('firmaec_p12', certToValidate);
                        localStorage.setItem('firmaec_p12_name', certName);
                        localStorage.setItem('firmaec_subject', resp.subjectDN);
                        localStorage.setItem('firmaec_emisor', resp.emisor || '');
                        localStorage.setItem('firmaec_cedula', resp.cedula || '');
                        localStorage.setItem('firmaec_nombres', resp.nombres || '');
                        localStorage.setItem('firmaec_apellidos', resp.apellidos || '');
                        localStorage.setItem('firmaec_validFrom', resp.validFrom || '');
                        localStorage.setItem('firmaec_validTo', resp.validTo || '');
                        localStorage.setItem('firmaec_expirado', resp.expirado || 'NO');
                        localStorage.setItem('firmaec_revocado', resp.revocado || 'NO');
                        
                        if (resp.qrPreview) {
                            localStorage.setItem('firmaec_qr', resp.qrPreview);
                            me.qrPreview = resp.qrPreview;
                        }
                        
                        me.p12Base64 = certToValidate;
                        me.p12Name = certName;
                        me.subjectDN = resp.subjectDN;
                        
                        var match = me.subjectDN.match(/CN=([^,]+)/);
                        me.cleanName = match ? match[1] : me.subjectDN;
                        
                        tempP12Base64 = null;
                        tempP12Name = null;

                        var texto = "Certificado V\u00E1lido y Guardado en Memoria!\n\n" +
                                    "Certificado Emitido por: " + (resp.emisor || resp.issuerDN) + "\n" +
                                    "C\u00E9dula: " + (resp.cedula || 'N/A') + "\n" +
                                    "Nombres: " + (resp.nombres || 'N/A') + "\n" +
                                    "Apellidos: " + (resp.apellidos || 'N/A') + "\n" +
                                    "Fecha de Emisi\u00F3n: " + (resp.validFrom || 'N/A') + "\n" +
                                    "Fecha de Expiraci\u00F3n: " + (resp.validTo || 'N/A') + "\n" +
                                    "Expirado: " + (resp.expirado || 'NO') + "\n" +
                                    "Revocado: " + (resp.revocado || 'NO');
                        txtResultado.setValue(texto);
                        updateCertState();
                    } else {
                        Ext.Msg.show({
                            title: 'Error',
                            msg: 'No se encuentran certificados para firmar<br>Puede estar expirado, revocado o no reconocido',
                            buttons: Ext.Msg.OK,
                            icon: Ext.MessageBox.ERROR
                        });
                        txtResultado.setValue("Error de validaci\u00F3n: \n" + resp.message);
                    }
                },
                failure: function(response) {
                    Ext.getBody().unmask();
                    txtPasswordVal.setValue('');
                    Ext.Msg.alert('Error', 'Fallo de conexi\u00F3n al validar certificado.');
                }
            });
        };

        var txtPasswordVal = new Ext.form.TextField({
            inputType: 'password',
            fieldLabel: 'Contrase\u00F1a',
            anchor: '-20',
            height: 28,
            style: 'font-size: 14px; margin-bottom: 15px;',
            enableKeyEvents: true,
            listeners: {
                specialkey: function(field, e) {
                    if (e.getKey() === e.ENTER) {
                        doValidarCertificado();
                    }
                }
            }
        });

        var txtResultado = new Ext.form.TextArea({
            hideLabel: true,
            readOnly: true,
            anchor: '-20',
            height: 230
        });

        var tempP12Base64 = null;
        var tempP12Name = null;

        var btnCargarNuevoCert = new Ext.Button({
            anchor: '-20',
            height: 80,
            style: 'margin-bottom: 20px;',
            text: '<table style="width:100%;"><tr>' +
                  '<td style="width:40%; text-align:right; padding-right:35px;"><i class="fas fa-certificate fa-3x" style="color: #636a97;"></i></td>' +
                  '<td style="text-align:left; padding-left: 10px;">' +
                  '<span style="font-size: 14px;">Buscar Nuevo Certificado</span><br>' +
                  '<span style="font-size: 12px;">Tambi\u00E9n lo puedes arrastrar aqu\u00ED</span>' +
                  '</td></tr></table>',
            handler: function() {
                openFileDialog('.p12,.pfx', function(name, base64) {
                    tempP12Base64 = base64;
                    tempP12Name = name;
                    txtResultado.setValue('Archivo seleccionado: ' + name + '\nPor favor, ingrese la contrase\u00F1a y presione Validar para guardarlo en memoria.');
                    txtPasswordVal.focus(false, 200);
                });
            },
            listeners: {
                afterrender: function(btn) {
                    var el = btn.getEl().dom;
                    el.addEventListener('dragover', function(e) {
                        e.stopPropagation(); e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        el.style.opacity = '0.7';
                    });
                    el.addEventListener('dragleave', function(e) {
                        e.stopPropagation(); e.preventDefault();
                        el.style.opacity = '1';
                    });
                    el.addEventListener('drop', function(e) {
                        e.stopPropagation(); e.preventDefault();
                        el.style.opacity = '1';
                        var file = e.dataTransfer.files[0];
                        if (file && (file.name.toLowerCase().indexOf('.p12') > -1 || file.name.toLowerCase().indexOf('.pfx') > -1)) {
                            var reader = new FileReader();
                            reader.onload = function(evt) {
                                tempP12Base64 = evt.target.result.split(',')[1];
                                tempP12Name = file.name;
                                txtResultado.setValue('Archivo arrastrado: ' + file.name + '\nPor favor, ingrese la contrase\u00F1a y presione Validar para guardarlo en memoria.');
                                txtPasswordVal.focus(false, 200);
                            };
                            reader.readAsDataURL(file);
                        } else {
                            Ext.Msg.alert('Error', 'Por favor, arrastre un archivo de certificado v\u00E1lido (.p12 o .pfx)');
                        }
                    });
                }
            }
        });

        var btnBorrarCert = new Ext.Button({
            anchor: '-20',
            height: 80,
            style: 'margin-bottom: 20px;',
            hidden: true,
            text: '<table style="width:100%;"><tr>' +
                  '<td style="width:40%; text-align:right; padding-right:35px;"><i class="fas fa-trash-alt fa-3x"></i></td>' +
                  '<td style="text-align:left; padding-left: 10px;">' +
                  '<span style="font-size: 14px;">Borrar Certificado de Memoria</span><br>' +
                  '<span style="font-size: 12px;">Elimina el certificado actual de forma segura</span>' +
                  '</td></tr></table>',
            handler: function() {
                Ext.Msg.confirm('Confirmar', '\u00BFEst\u00E1 seguro de borrar el certificado de la memoria?', function(btn) {
                    if (btn == 'yes') {
                        localStorage.removeItem('firmaec_p12');
                        localStorage.removeItem('firmaec_p12_name');
                        localStorage.removeItem('firmaec_subject');
                        localStorage.removeItem('firmaec_qr');
                        localStorage.removeItem('firmaec_emisor');
                        localStorage.removeItem('firmaec_cedula');
                        localStorage.removeItem('firmaec_nombres');
                        localStorage.removeItem('firmaec_apellidos');
                        localStorage.removeItem('firmaec_validFrom');
                        localStorage.removeItem('firmaec_validTo');
                        localStorage.removeItem('firmaec_expirado');
                        localStorage.removeItem('firmaec_revocado');
                        me.p12Base64 = null;
                        me.p12Name = null;
                        me.subjectDN = 'Usuario';
                        me.cleanName = 'Usuario';
                        me.qrPreview = null;
                        tempP12Base64 = null;
                        tempP12Name = null;
                        txtResultado.setValue('Certificado borrado de memoria.');
                        updateCertState();
                    }
                });
            }
        });

        var pnlValidar = new Ext.FormPanel({
            title: '<span style="font-size: 13px; padding: 1px;"><i class="fas fa-shield-alt"></i> Validar Certificado</span>',
            frame: false,
            border: false,
            bodyStyle: 'padding:20px; background-color: #fff;',
            labelWidth: 100,
            items: [
                btnCargarNuevoCert,
                btnBorrarCert,
                txtPasswordVal,
                {
                    xtype: 'box',
                    anchor: '-20',
                    autoEl: {
                        tag: 'div',
                        html: '<div style="text-align:center; margin-bottom: 10px; font-size: 12px;">RESULTADOS DE VERIFICACI\u00D3N</div>'
                    }
                },
                txtResultado
            ],
            buttons: [
                { 
                    text: '<span style="font-size:12px; padding: 0 10px;"><i class="fas fa-check-circle"></i> Validar y Guardar en Memoria</span>', 
                    height: 28,
                    handler: doValidarCertificado
                }
            ]
        });

        updateCertState();

        this.items = [
            new Ext.TabPanel({
                cls: 'sissol-firma-tabs',
                activeTab: 0,
                deferredRender: false,
                border: false,
                bodyStyle: 'background-color: transparent;',
                items: [pnlFirmar, grdVerificar, pnlValidar]
            })
        ];

        FrmFirma.superclass.initComponent.call(this);
    }
});
