/**
 * NOVIUS OS - Web OS for digital communication
 *
 * @copyright  2011 Novius
 * @license    GNU Affero General Public License v3 or (at your option) any later version
 *             http://www.gnu.org/licenses/agpl-3.0.html
 * @link http://www.novius-os.org
 */
define(
    [
        'jquery-nos',
        'jquery-ui.sortable',
        'jquery-ui.resizable'
    ],
    function($) {
        "use strict";
        return function(id, options, is_new, is_expert) {
            var $container = $(id);

            var $resizable;
            var $sortable;

            var $preview_container = $container.find('.preview_container');
            var $fields_container = $container.find('.fields_container');
            var $layout = $container.closest('form').find('[name=form_layout]');
            var $submit_informations = $container.find('.submit_informations');
            var $currentTab = $('.nos-ostabs-panel.ui-widget-content:not(".nos-ostabs-hide")');

            var throttle = new ThrottleRequest(800);

            $fields_container.show();
            $submit_informations.show();

            // This object will be use to generate preview
            var $clone_preview = $container.find('[data-id=clone_preview]').clone().removeAttr('data-id');
            $container.find('[data-id=clone_preview]').remove();

            // Initializes blank state
            var $blank_slate = $container.find('.field_blank_slate');
            $blank_slate.find('label').hover(function() {
                $(this).addClass('ui-state-hover');
            }, function() {
                $(this).removeClass('ui-state-hover');
            });

            // Initializes the preview container
            var col_size = Math.round($preview_container.outerWidth() / 4);
            $preview_container.width($preview_container.outerWidth() - $preview_container.width());

            // Overwrite save button standard behavior to only submit the form
            $(document).ready(function() {
                $currentTab.find('button.ui-priority-primary[type="submit"]').unbind()
                    .bind('click', function() {
                        $container.closest('form').submit();
                    });
            });

            // Handles form submit
            $container.closest('form').submit(function(e) {
                // Rewriting layout to be inserted in database
                var layout = '';
                $container.find('tr.preview_row').each(function(i) {
                    var $preview = $(this).find('td.preview');
                    if ($preview.length > 0 && layout != '') {
                        layout += "\n";
                    }
                    $preview.each(function(j) {
                        var $preview = $(this);
                        var $field = $preview.data('field');
                        if (!$field) {
                            return;
                        }
                        j == 0 || (layout += ',');
                        layout += getFieldProperty($field, 'field_id').val() + '=' + getCellColspan($preview);
                    });
                });
                $layout.val(layout);

                var ajaxData = {form_layout: layout};
                var inputs = {};
                var fieldPrefix = 'field[';
                // match field[id][field_name]
                var idRegex = /[^\[]+\[([0-9]+)\]\[([^\]]+)\]/;

                // Gets fields data
                // @todo why not jQuery.serialize() ?
                $(this).find('input,textarea,select').each(function() {
                    var $this = $(this);
                    if (!$this.attr('name')) {
                        return;
                    }

                    // If the input name does not match the regex, put the value in the post as usual
                    // _csrf is handled here
                    if ($this.attr('name').indexOf(fieldPrefix) != 0) {
                        if ($this.not('[type="checkbox"]').length || $this.is(":checked")) {
                            ajaxData[$this.attr('name')] = $this.val();
                        }
                        return;
                    }

                    var fieldInfos = $this.attr('name').match(idRegex);
                    if (!fieldInfos.length || fieldInfos.length < 3) {
                        return;
                    }

                    var id = parseInt(fieldInfos[1]);
                    var fieldName = fieldInfos[2];
                    var value = $this.val();
                    if ($this.is(':checkbox')) {
                        value = +$this.is(":checked");
                    }
                    if (!id || !fieldName) {
                        return;
                    }

                    if (!inputs[id]) {
                        inputs[id] = {};
                    }
                    inputs[id][fieldName] = value;
                });

                // Sending a standard nosAjax request
                ajaxData['fields'] = JSON.stringify(inputs);
                var action = $(this).attr('action');
                $container.nosAjax({
                    data: ajaxData,
                    type: 'post',
                    url: action,
                    dataType: 'json'
                });
                return false;
            });

            // Handles click on add button
            $container.on('click', '[data-id=add]', function onAdd(e) {
                e.preventDefault();
                var params_button = $(this).data('params');
                $blank_slate.data('params', params_button);
                if (params_button.type == 'page_break') {
                    createLayoutFields('page_break');
                } else {
                    $(this).closest('p')[params_button.where == 'top' ? 'after' : 'before']($blank_slate);
                    $blank_slate.show();
                    setLayoutPadding();
                }
            });

            // Add a new field when clicking the "Add" button, either at top or bottom
            $blank_slate.on('click', 'label', function(event) {
                event.preventDefault();
                createLayoutFields($(this).data('layout-name'));
            });

            // Handles click on a preview
            $preview_container.on('click', 'td.preview', function onClickPreview(e) {
                e.preventDefault();

                var $preview = $(this);
                var $field = $preview.data('field');

                // Make the preview look "active"
                $preview_container.find('td.preview').removeClass('ui-state-active');
                $preview.addClass('ui-state-active');

                // Show the appropriate field and position it
                showField($field);

                // Auto focus the label field
                getFieldProperty($field, 'field_label').focus();
            });

            // Handles field duplication
            $preview_container.on('click', '[data-id=copy]', function onClickCopy(e) {
                e.preventDefault();
                // Don't bubble to .preview container
                e.stopPropagation();
            });

            // Handles field delete
            $fields_container.on('click', '[data-id=delete]', function on_delete(e) {
                e.preventDefault();
                // Don't bubble to .preview container
                e.stopPropagation();
                if (confirm($.nosCleanupTranslation(options.textDelete))) {
                    // Gets
                    var $field = getSelectedField();
                    if ($field) {
                        deleteField($field);
                    }
                }
            });

            // Handles field driver change
            $fields_container.on('change', 'select[name$="[field_driver]"]', function on_type_change(e) {
                var $field = $(this).closest('.field_enclosure');
                var field_id = getFieldProperty($field, 'field_id').val();

                // Gets the field data
                var fieldData = getFieldData($field);

                // Regenerates the field meta
                $.ajax({
                    url: 'admin/noviusos_form/form/render_field/'+field_id,
                    type: "POST",
                    dataType: 'json',
                    data: {
                        fieldData: JSON.stringify(fieldData)
                    },
                    success: function(json) {

                        var $preview = getFieldPreviewElement($field);

                        // Updates the field meta
                        if (json.meta) {

                            // Replaces the current field meta with the new field meta
                            var $newField = $(json.meta);
                            $field.replaceWith($newField);
                            $field = $newField;
                            $field.nosFormUI();

                            // Restores the link between the field and the preview
                            $field.data('preview', $preview);
                            $preview.data('field', $field.not('script'));
                        }

                        // Updates the field preview
                        refreshFieldPreviewLabel($field);
                        if (typeof json.preview !== 'undefined') {
                            var html = json.preview;

                            // Appends the details
                            var details = getFieldProperty($field, 'field_details').val();
                            if (details != '') {
                                html += '<div class="details">' + $('<div/>').text(details).html() + '</div>';
                            }

                            // Updates the preview content
                            $preview.find('div.preview_content').html(html);

                            refreshPreviewHeight($preview.closest('tr'));
                        } else {
                            refreshFieldPreviewContent($field);
                        }

                        // The 'type' field is for sure in the first wijmo-wijaccordion-content so we know $field IS an .accordion too
                        // So the selectedIndex is for sure '0'
                        $field.find('.wijmo-wijaccordion-content').each(function() {
                            var $accordion_content = $(this);
                            // We need to select the appropriate index with wijaccordion() prior to changing the style or it's all messed up
                            if ($accordion_content.find(':input').filter(function() {
                                    return $(this).closest('p').css('display') != 'none';
                                }).length == 0) {
                                // wijaccordion('activate', 0) does not work properly.

                                // Hide .accordion-header
                                $accordion_content.prev().hide();
                            } else {
                                $accordion_content.prev().show();
                            }
                        });

                        // Generate default value before preview, because the preview uses it
                        //generateFieldDefaultValue($field);

                        $field.find('[name$="[field_label]"]').trigger('change');
                        $field.find('[name$="[field_style]"]').trigger('change');
                    }
                });
            });

            // Handles style change
            $fields_container.on('change', 'select[name$="[field_style]"]', function on_style_change(e) {
                var style = $(this).val();
                var $field = $(this).closest('.field_enclosure');
                var $message = $field.find('[name$="[field_message]"]');
                var $new = $(style == 'p' ? '<textarea rows="4"></textarea>' : '<input type="text" />');

                $new.attr({
                    name: $message.attr('name'),
                    id: $message.attr('id')
                });
                $new.val($message.val());

                $new.insertAfter($message);
                $message.remove();
                $new.parent().nosFormUI();
                // Converting textarea to input will loose line breaks
                $new.trigger('change');
            });

            //// Handles mandatory change
            //$fields_container.on('change', 'input[name$="[field_mandatory]"]', function on_change_field_mandatory(e) {
            //    var $field = $(this).closest('.field_enclosure');
            //    generateFieldDefaultValue($field);
            //});

            // Keeps preview label in sync
            $fields_container.on('change keyup', 'input[name$="[field_label]"]', function() {
                refreshFieldPreviewLabel($(this).closest('.field_enclosure'));
            });
            $fields_container.on('change', 'input[name$="[field_mandatory]"]', function() {
                refreshFieldPreviewLabel($(this).closest('.field_enclosure'));
            });

            // Events that regenerates the preview content
            $fields_container.on('change keyup',
                 'textarea[name$="[field_choices]"],'
                +'[name$="[field_message]"],'
                +'[name$="[field_default_value]"],'
                +'input[name$="[field_width]"],'
                +'input[name$="[field_height]"],'
                +'textarea[name$="[field_details]"]',
                function() {
                    refreshFieldPreviewContent($(this).closest('.field_enclosure'));
                }
            );

            //// Handles textarea choices change
            //$fields_container.on('blur change', 'textarea[name$="[field_choices]"]', function regenerateFieldDefaultValue(e) {
            //    refreshFieldPreviewContent($(this).closest('.field_enclosure'));
            //});

            // Can be triggered by custom field scripts
            $fields_container.on('refreshPreview', '.field_enclosure', function() {
                var $field = $(this);
                refreshFieldPreviewContent($field);
                refreshFieldPreviewLabel($field);
            });

            // Initializes the fields meta
            $fields_container.children('.field_enclosure').each(function onEachFields() {
                var $field = $(this);
                onFieldAdded($field, 'bottom');
                $field.hide();
            });
            hideFieldActions();

            // Initializes the preview layout
            applyPreviewLayout($layout.val());
            setTimeout(function() {
                refreshPreviewHeight();
            }, 100);

            // If it's a new form then creates the default fields layout
            if (is_new) {
                createLayoutFields('default');
            }

            // Initializes the form submit configuration
            var $form_captcha = $container.find('[name=form_captcha]'),
                $form_submit_label = $container.find('[name=form_submit_label]'),
                $form_submit_email = $container.find('[name=form_submit_email]');

            $form_captcha.on('change', function() {
                $submit_informations.find('.form_captcha')[$(this).is(':checked') ? 'show' : 'hide']();
            }).trigger('change');

            $form_submit_label.on('change keyup', function() {
                $submit_informations.find('input:last').val($(this).val());
            }).trigger('change');

            $form_submit_email.on('change keyup', function() {
                var mail = $.trim($(this).val());
                $submit_informations.find('.form_submit_email')
                    .find('span:first')
                    .html(mail.replace('\n', ', ', 'g'))
                    .end()
                    .find('span:last')[mail ? 'hide': 'show']();
            }).trigger('change');

            $submit_informations.on('click', function() {
                $container.find('.preview').removeClass('ui-state-active');
                var $accordion = $form_submit_label.closest('.accordion');
                showField($accordion);
                hideField();
                setLayoutPadding($submit_informations);
                $submit_informations.addClass('ui-state-active');
                $container.find('.preview_arrow').show();
            });

            /**
             * Creates the specified layout's fields
             *
             * @param layoutName
             */
            function createLayoutFields(layoutName) {
                var where = ($blank_slate.data('params') || {}).where || 'bottom';

                var nos_fixed_content = $container.closest('.nos-fixed-content').get(0);
                var old_scroll_top = nos_fixed_content.scrollTop;
                $.ajax({
                    url: 'admin/noviusos_form/form/render_layout/'+layoutName,
                    dataType: 'json',
                    success: function(json) {
                        $blank_slate.hide();

                        if (json.fields && json.layout) {

                            // Gets the fields
                            var $fields = $(json.fields.join(''));
                            if (where == 'top') {
                                $fields = $($fields.get().reverse());
                            }

                            // Injects the fields
                            $fields_container.append($fields);
                            $fields = $fields.not('script');
                            $fields.nosFormUI();

                            // Initializes the fields
                            var $previews = $();
                            $fields.each(function(index) {
                                var $field = $(this);

                                onFieldAdded($field, where);

                                // Creates the preview
                                var $preview = getFieldPreviewElement($field);
                                if ($preview) {
                                    if (json.previews && json.previews[index]) {
                                        var $td = $preview.find('div.preview_content');
                                        $td.html(json.previews[index]);
                                    }
                                    refreshFieldPreviewLabel($field);
                                    $previews = $previews.add($preview);
                                }

                                $field.hide();
                            });

                            // Initializes the preview layout
                            applyPreviewLayout(json.layout);
                            nos_fixed_content.scrollTop = old_scroll_top;
                            $previews.addClass('ui-state-hover');
                            setTimeout(function() {
                                $previews.removeClass('ui-state-hover');
                            }, 500);
                        }
                    }
                });
            }

            /**
             * Shows the field actions
             */
            function showFieldActions() {
                $fields_container.find('.show_hide').show();
            }

            /**
             * Hides the field actions
             */
            function hideFieldActions() {
                $fields_container.find('.show_hide').hide();
            }

            /**
             * Called after a field is added
             *
             * @param $field
             * @param where
             */
            function onFieldAdded($field, where) {
                var $driver = getFieldProperty($field, 'field_driver');
                if ($driver.length == 0) {
                    // Submit informations
                    return;
                }

                // The clone will be wrapped into a <tr class="preview_row">
                var $preview = getOrCreateFieldPreview($field);
                var field_id = getFieldProperty($field, 'field_id').val();
                $preview.attr('data-field-id', field_id);
                $preview_container[where == 'top' ? 'prepend' : 'append']($preview.parent());
                //$driver.trigger('change');
            }

            /**
             * Show the field
             * 
             * @param $field
             */
            function showField($field) {
                
                // Show the field actions
                showFieldActions();

                if ($field.is('.field_enclosure') && !$field.is('.page_break')) {
                    $field.show();
                    $field.nosOnShow();
                }

                // Hides others fields
                $field.siblings('.field_enclosure').hide();

                setLayoutPadding();
                var $submit_label = getFieldProperty($field, 'field_submit_label');
                if ($submit_label.length == 0) {
                    $submit_informations.removeClass('ui-state-active');
                }
            }

            /**
             * Hides the field
             * 
             * @param $field
             */
            function hideField($field) {
                hideFieldActions();
                if ($field) {
                    $field.hide();
                }
            }

            /**
             * Gets or create the field preview
             *
             * @param $field
             * @returns {*}
             */
            function getOrCreateFieldPreview($field) {

                var $preview = getFieldPreviewElement($field);
                if ($preview) {
                    return $preview;
                }

                // Generate a new preview
                var $clone = $clone_preview.clone();
                $preview = $clone.find('td.preview');
                setCellColspan($preview, 4);

                $field.data('preview', $preview);
                $preview.data('field', $field);

                $preview.find('button.notransform').removeClass('notransform');
                $preview.nosFormUI().show().nosOnShow();
                $preview.find('input, select').on('click', function(e) {
                    e.preventDefault();
                });

                return $preview;
            }

            /**
             * Gets the field preview element
             *
             * @param $field
             * @returns {*|boolean}
             */
            function getFieldPreviewElement($field)
            {
                if (!$field || !$field.data('preview')) {
                    return false;
                }
                return $field.data('preview');
            }

            /**
             * Deletes a field
             *
             * @param $field
             */
            function deleteField($field) {
                // Gets the linked preview
                var $preview = getFieldPreviewElement($field);

                $field.remove();

                hideFieldActions();

                // Removes the preview
                if ($preview) {
                    $preview.addClass('ui-state-error').hide(500, function () {
                        $preview.remove();
                        initPreviewLayout();
                    });
                }
            }

            /**
             * Sets the layout padding
             * 
             * @param $target
             */
            function setLayoutPadding($target) {
                $target = $target || $preview_container.find('.preview.ui-state-active');
                if ($target.length == 0) {
                    $target = $submit_informations.not(':not(.ui-state-active)');
                }
                if ($target.length > 0) {
                    var diff = $target.is('.submit_informations') ? 14 : -40;
                    var pos = $target.position();
                    $fields_container.css({
                        paddingTop: Math.max(0, pos.top + diff) + 'px' // 29 = arrow height
                    });
                }
            }

            /**
             * Gets the selected field
             *
             * @returns {boolean}
             */
            function getSelectedField() {
                // Gets the active preview
                var $preview = $preview_container.find('.preview.ui-state-active');

                // Gets the related field
                var $field = $preview.data('field');

                return $field && $field.length ? $field : false;
            }

            /**
             * Gets the driver config
             *
             * @param driverClass
             * @param path
             * @param defaultValue
             * @returns {config.config|{}}
             */
            function getDriverConfig(driverClass, path, defaultValue) {
                var config = options.driversConfig[driverClass] || {};
                if (path) {
                    return _get(config.config, path, defaultValue);
                } else {
                    return config.config;
                }
            }

            /**
             * Gets the driver name
             * 
             * @param driverClass
             * @returns {*}
             */
            function getDriverName(driverClass) {
                var config = options.driversConfig[driverClass] || {};
                return config.name;
            }

            /**
             * Checks if the specified field name is present in any of the field meta layout
             *
             * @param fieldName
             * @param field_driver
             * @returns {boolean}
             */
            function isFieldInDriverMetaLayout(fieldName, field_driver) {
                var driverConfig = getDriverConfig(field_driver);
                if (driverConfig) {
                    var layout = _get(driverConfig, 'admin.layout');
                    if (typeof layout === 'object') {
                        for (var name in layout) {
                            if (layout.hasOwnProperty(name)) {
                                if (typeof layout[name].fields === 'object' && $.inArray(fieldName, layout[name].fields) !== -1) {
                                    return true;
                                }
                            }
                        }
                    }
                }
                return false;
            }

            /**
             * Gets the $field data (properties values)
             *
             * @param $field
             * @returns {*}
             */
            function getFieldData($field)
            {
                var data = $field.find(':input').serializeArray();
                for (var i = 0; i < data.length; i++) {
                    // Removes data name prefix
                    data[i].name = data[i].name.replace(/field\[[0-9]*\]\[([^\]]+)\]/, "$1")
                }
                return data;
            }

            function getFieldProperty($context, field_name) {
                return $context.find('[name$="[' + field_name + ']"]');
            }

            /**
             * Refreshes the preview label
             *
             * @param $field
             */
            function refreshFieldPreviewLabel($field) {

                // Gets the preview element
                var $preview = getFieldPreviewElement($field);
                if (!$preview) {
                    return;
                }

                // Gets the preview label element
                var $label = $preview.find('label.preview_label');

                // Hides the label if not in the meta layout
                var field_driver = getFieldProperty($field, 'field_driver').val();
                if (!isFieldInDriverMetaLayout('field_label', field_driver)) {
                    $label.hide();
                }
                // Otherwise updates it
                else {
                    $label.text(getFieldPreviewLabel($field));
                    $label.show();
                }
            }

            /**
             * Gets the preview label
             * 
             * @returns {*}
             */
            function getFieldPreviewLabel($field) {
                // Gets the field label value
                var label = getFieldProperty($field, 'field_label').val();

                // Appends an asterisk if mandatory
                if (getFieldProperty($field, 'field_mandatory').is(':checked')) {
                    label += '*';
                }
                
                return label;
            }

            /**
             * Generates the preview content
             *
             * @param $field
             */
            function refreshFieldPreviewContent($field) {
                var field_id = getFieldProperty($field, 'field_id').val();
                var type = getFieldProperty($field, 'field_type').val();
                var details = getFieldProperty($field, 'field_details').val();
                var $preview = getFieldPreviewElement($field);
                var $td = $preview.find('div.preview_content');

                // @todo Ajax request to get the preview
                // Gets field data
                var fieldData = getFieldData($field);

                throttle.request(function(done) {
                    $.ajax({
                        url: 'admin/noviusos_form/form/render_field_preview/'+field_id,
                        type: "POST",
                        dataType: 'json',
                        data: {
                            fieldData: JSON.stringify(fieldData)
                        },
                    }).done(function(json) {

                            if (typeof json.preview !== 'undefined') {

                                var html = json.preview;

                                // Appends the details
                                if (details != '') {
                                    html += '<div class="details">' + $('<div/>').text(details).html() + '</div>';
                                }

                                // Updates preview HTML
                                $td.html(html);

                                refreshPreviewHeight($preview.closest('tr'));
                            }
                        })
                        .always(function() {
                            done();
                        })
                    ;
                });

                // @todo migrate to a driver
                if (type == 'page_break') {
                    $preview.addClass('page_break ui-widget-header');
                    //$preview.find('.resizable').removeClass('.resizable');
                }
            }

            function refreshPreviewHeight($tr) {
                ($tr || $preview_container.find('tr')).css('height', '').each(function sameHeight() {
                    var $resizable = $(this).find('div.resizable').css('height', '');
                    $resizable.css('height', $(this).height());
                });
            }

            function resizeToBest($tr, priority) {

                // If there's only one padding cell, it's already good!
                if ($tr.find('td:not(.padding)').length == 0) {
                    return;
                }

                // Don't take padding into account (will be re-added at the end if needed)
                $tr.find('td.padding').remove();

                var $cells = $tr.find('td.preview:visible');
                var cell_sizes = [];
                var total_size = 0;
                var $widest = [];
                var max_cell_size = 5 - $cells.length;

                $cells.each(function() {
                    var $cell = $(this);
                    // When doing a resize, the <td> keeps the same width, only the div.resizable changes size
                    var $item = $cell.find('.resizable');
                    if ($item.length == 0) {
                        $item = $cell;
                    }
                    var cell_size = Math.round($item.outerWidth() / col_size);
                    cell_size = Math.max(1, Math.min(max_cell_size, cell_size));
                    cell_size = parseInt($item.attr('colspan')) || cell_size;
                    cell_sizes.push(cell_size);
                    total_size += cell_size;
                    $cell.data('colspan', cell_size);

                    if ($widest.length == 0 || cell_size > $widest.data('colspan')) {
                        $widest = $cell;
                    }
                });

                // If total size overflow the 4 columns, we need to shrink one of them
                if (total_size > 4) {
                    //log("CELL WIDTHS = ", cell_sizes.join(','), total_size);

                    if (priority === undefined || priority == null) {
                        priority = $widest.get(0);
                        //log('priority was not set, automatically using ', priority);
                    } else {
                        //log('using defined priority ', priority);
                    }

                    var total_shrink_needed = total_size - 4;
                    // Shrink what we can (size > 1)
                    var $shrink_me = $cells.filter(function() {
                        return $(this).data('colspan') > 1 && this != priority;
                    });
                    //log('shrinkable items are', $shrink_me);
                    $shrink_me.closest('td.preview').each(function() {
                        var $cell = $(this);
                        var size = $cell.data('colspan');
                        var shrink_by = 1;
                        while ((size - shrink_by > 1) && (total_shrink_needed - shrink_by) > 0) {
                            shrink_by++;
                        }
                        ;
                        //log('shrinking ', this, ' by ', shrink_by);
                        total_shrink_needed -= shrink_by;
                        $cell.data('colspan', size - shrink_by);
                    });
                    // We need to shrink priority now...
                    if (total_shrink_needed > 0) {
                        //log('shrinking priority cell', priority, ' by ', total_shrink_needed);
                        $(priority).data('colspan', $(priority).data('colspan') - total_shrink_needed);
                    }
                }

                // Resize the <td> according to the new resized valued
                $tr.find('td.preview').each(function() {
                    //log('col size = ', $(this).data('colspan'));
                    setCellColspan($(this), $(this).data('colspan'));
                    $(this).removeData('colspan');
                });

                // Add a padding cell if necessary
                if (total_size < 4) {
                    var $padding = $('<td class="padding">&nbsp;</td>');
                    setCellColspan($padding, (4 - total_size));
                    //log('adding a padding cell with size = ', (4 - total_size), $padding, ' to ', $tr);
                    $tr.append($padding);
                } else {
                    //log('no padding neeeded');
                }
            }

            // Set colspan and restore children width
            function setCellColspan($td, colspan) {
                $td.attr('colspan', colspan).children().css('width', 'auto');
            }

            // Returns the colspan, according to width
            function getCellColspan($td) {
                return Math.round($td.width() / col_size);
            }

            // Save cell width
            function saveCellWidth($tr) {
                $tr.find('td.preview:visible').each(function() {
                    var $this = $(this);
                    $this.data('saved_colspan', getCellColspan($this));
                })
            }

            // Save cell width
            function restoreCellWidth($tr) {
                $tr.find('td.preview:visible').each(function() {
                    var $this = $(this);
                    var saved_colspan = $this.data('saved_colspan');
                    if (saved_colspan) {
                        setCellColspan($this, saved_colspan);
                    }
                });
            }

            function initSortable() {
                try {
                    $sortable.destroy();
                } catch (e) {
                }

                $preview_container.find('td.padding').remove();
                $preview_container.find('td.sortable_placeholder').remove();
                // Remove empty lines
                $preview_container.find('tr').addClass('preview_row').filter(function() {
                    return $(this).children().not('.placeholder').length == 0;
                }).remove();

                $preview_container.find('td.page_break').each(function() {
                    var $td = $(this);
                    setCellColspan($td, 4);
                    $td.closest('tr').addClass('page_break');
                });

                // Add empty lines to drop before / after (above / below) existing .preview_row
                $preview_container.find('tr').before('<tr class="preview_row preview_inserter"><td class="padding" colspan="4">&nbsp;</td></tr>');
                $preview_container.append('<tr class="preview_row preview_inserter"><td class="padding" colspan="4">&nbsp;</td></tr>');

                $preview_container.find('tr.preview_row').each(function() {
                    resizeToBest($(this));
                });

                // Connects only list which don't have 4 children
                $preview_container.find('tr').removeClass('preview_row_sortable').filter(function() {
                    return $(this).children().not('.padding').length < 4;
                }).addClass('preview_row_sortable');

                var field_colspan;

                // @TODO find a way to only connect others lists (not including itself)
                $sortable = $preview_container.find('tr.preview_row:not(.page_break)').sortable({
                    connectWith: id + ' tr.preview_row_sortable:not(.page_break)',
                    dropOnEmpty: true,
                    helper: "clone", // This is needed when using the "appendTo" option
                    appendTo: id, // Where the 'helper' is appended
                    items: '> td.preview',
                    forceHelperSize: true,
                    placeholder: 'sortable_placeholder preview',
                    tolerance: 'pointer', // 'intersect' or 'pointer'
                    handle: '.handle',
                    beforeStop: function(e, ui) {
                        // http://bugs.jqueryui.com/ticket/6054
                        // When dropping occurs outside of the items
                        //return false;
                    },
                    start: function onSortableStart(e, ui) {
                        var $tr = ui.placeholder.closest('tr');

                        // Blur the selection
                        blur();

                        // Retain container height while dragging (the sortable will hide the item, possibly making an empty row without height)
                        $tr.css('height', ui.item.height());

                        // Style the placeholder with jQuery UI skin
                        // Do this after the blur, or the ui-state-active will be removed
                        ui.placeholder.addClass('ui-widget-content ui-state-active');

                        // Firefox: height=100% on absolute div inside the position=relative cell is messed up
                        ui.placeholder.children().css('height', $tr.css('height'));

                        // Make the placeholder the same width as the original item.
                        setCellColspan(ui.placeholder, getCellColspan(ui.helper));
                    },
                    update: function onSortableUpdate(e, ui) {
                        var $tr = ui.item.closest('tr');
                        // Restore original height
                        $tr.css('height', '');

                        // Resize the current line on drop, or the lines above would be all messed up because the total
                        // colspan of a line below can exceed 4
                        $tr.children().css('height', $tr.css('height'));
                        setCellColspan(ui.item, field_colspan);
                        resizeToBest($tr, ui.item.get(0));

                        // Re-initialise everything
                        initPreviewLayout();
                    },
                    over: function onSortableOver(e, ui) {
                        var $tr = ui.placeholder.closest('tr');

                        ui.item.children().css('height', '');

                        // Save old size on over
                        ui.placeholder.hide();
                        saveCellWidth($tr);
                        ui.placeholder.show();

                        // Firefox: height=100% on absolute div inside the position=relative cell is messed up
                        ui.placeholder.children().css('height', $tr.css('height'));

                        // Let's try to retain original item size
                        setCellColspan(ui.placeholder, getCellColspan(ui.helper));

                        // Handle overflow (> 4 columns)
                        resizeToBest($tr, ui.placeholder.get(0));

                        // Save appropriate colspan for the dragged field
                        field_colspan = getCellColspan(ui.placeholder);
                    },
                    out: function onSortableOut(e, ui) {
                        var $tr = ui.placeholder.closest('tr');
                        //ui.placeholder.remove();
                        restoreCellWidth($tr);
                    }
                });

                $preview_container.find('tr.preview_row.page_break').sortable({
                    appendTo: id, // Where the 'helper' is appended
                    connectWith: id + ' tr.preview_row_sortable.preview_inserter',
                    helper: "clone", // This is needed when using the "appendTo" option
                    dropOnEmpty: true,
                    forceHelperSize: true,
                    forcePlaceholderSize: true,
                    placeholder: 'sortable_placeholder preview', // ui-state-active
                    handle: '.handle',
                    start: function onSortableStart(e, ui) {
                        var $tr = ui.placeholder.closest('tr');

                        // Blur the selection
                        blur();

                        // Retain container height (the sortable will hide the item, possibly making an empty row without height)
                        $tr.css('height', ui.item.height());

                        // Style the placeholder with jQuery UI skin
                        // Do this after the blur, or the ui-state-active will be removed
                        ui.placeholder.addClass('ui-widget-content ui-state-active');

                        // Firefox: height=100% on absolute div inside the position=relative cell is messed up
                        ui.placeholder.children().css('height', $tr.css('height'));

                        // Make the placeholder the same width as the original item.
                        setCellColspan(ui.placeholder, 4);
                    }
                });
            }

            function blur() {
                var $preview = $preview_container.find('.ui-widget-content.ui-state-active');
                if ($preview.length == 0) {
                    return;
                }
                $preview.removeClass('ui-state-active');
                hideField($preview.data('field'));
            }

            function initResizable() {
                try {
                    $resizable.destroy();
                } catch (e) {
                }

                $resizable = $preview_container.find('td.preview').not('.page_break').find('div.resizable');
                $resizable = $resizable.resizable({
                    ghost: true,
                    handles: 'se',
                    autoHideType: true,
                    helper: 'helper_resize preview ui-state-active',
                    grid: [col_size, '2000'],
                    start: function(e, ui) {
                        blur();
                    },
                    stop: function(e, ui) {
                        var $tr = ui.element.closest('tr');
                        // Handle overflow (> 4 columns)
                        resizeToBest($tr, ui.element.closest('td').get(0));
                        refreshPreviewHeight($tr);
                    }
                });
            }

            /**
             * Initializes the preview layout
             * 
             * @param $tr
             */
            function initPreviewLayout($tr) {
                initResizable();
                initSortable();
                refreshPreviewHeight($tr);
            }

            /**
             * Applies the preview layout
             *
             * @param layout
             */
            function applyPreviewLayout(layout) {
                $.each(layout.split("\n"), function layoutLines() {
                    var $previous = null;
                    if (this == '') {
                        return;
                    }
                    $.each(this.split(','), function layoutCols() {
                        var item = this.split('=');
                        var field_id = item[0];
                        var field_width = item[1];
                        var $field = getFieldProperty($fields_container, 'field_id').filter(function() {
                            return $(this).val() == field_id;
                        }).closest('.field_enclosure');

                        var $preview = getFieldPreviewElement($field);

                        setCellColspan($preview, field_width);
                        if ($previous) {
                            $previous.after($preview);
                        }
                        $previous = $preview;
                    });
                });
                initPreviewLayout();
            }

            function _get(obj, path, defaultValue) {
                var value = path.split('.').reduce(function(prev, curr) {
                    return prev ? prev[curr] : undefined
                }, obj || self);
                return typeof value !== 'undefined' ? value : defaultValue;
            }
            /**
             * Throttle request helper
             *
             * @param updateThreshold
             * @constructor
             */
            function ThrottleRequest(updateThreshold) {
                var running, queuedRequest, lastTime;
                if (typeof updateThreshold !== 'number') {
                    updateThreshold = 1000;
                }
                var throttle = function(request) {
                    running = true;
                    var doneCallback = function triggerRequestEnd() {
                        running = false;
                        lastTime = +new Date;
                        // Executes the next request with a delay
                        if (queuedRequest) {
                            queuedRequest();
                            queuedRequest = null;
                        }
                    };
                    if (lastTime) {
                        var diff = (+new Date) - lastTime;
                        if (diff < updateThreshold) {
                            setTimeout(function () {
                                request(doneCallback);
                            }, updateThreshold - diff);
                            return;
                        }
                    }
                    request(doneCallback);
                };

                /**
                 * Runs a throttled request
                 *
                 * @param request
                 */
                this.request = function(request) {
                    if (running) {
                        queuedRequest = function() { throttle(request); };
                    } else {
                        throttle(request);
                    }
                };
            }

            //// @todo refacto
            //function generateFieldDefaultValue($field) {
            //
            //    var field_driver = getFieldProperty($field, 'field_driver').val();
            //    var type = getFieldProperty($field, 'field_type').val();
            //    var $default_value = getFieldProperty($field, 'field_default_value');
            //    var choices = getFieldProperty($field, 'field_choices').val();
            //
            //    var $new = null;
            //    var name = $default_value.attr('name');
            //
            //    // Updates the default selected value if the choice field is present
            //    if (isFieldInDriverMetaLayout('field_choices', field_driver)) {
            //
            //        var default_value_value = $default_value.val();
            //        if (default_value_value.match(/^[0-9,]+$/)) {
            //            default_value_value = default_value_value.split(',');
            //        } else {
            //            default_value_value = default_value_value.split("\n")
            //        }
            //
            //        var defaultValueType = getDriverConfig(field_driver, 'default_value_type');
            //
            //        // Select
            //        if ($default_value.is('select') || $default_value.is('radio')) {
            //            $default_value.val(default_value_value);
            //        }
            //
            //        else if ($default_value.is('checkbox')) {
            //
            //            var html = '<input type="hidden" size="1" name="' + $default_value.attr('name') + '" value=""  />';
            //            $.each(choices.split("\n"), function(i, choice) {
            //                html += '<label><input type="checkbox" class="checkbox" size="1" value="' + i + '" ' + (-1 !== $.inArray(choice, default_value_value) ? 'checked' : '') + '> ' + choice + '</label><br />';
            //            });
            //            $new = $(html);
            //        }
            //    }
            //
            //    if (-1 !== $.inArray(type, ['radio', 'select'])) {
            //        var html = '<select>';
            //        html += '<option value=""></option>';
            //        $.each(choices.split("\n"), function(i, choice) {
            //            var content = choice.match(/([^\\\][^=]|\\=)+/g);
            //            for (i in content) {
            //                content[i] = content[i].replace(/\\=/, '=');
            //            }
            //            var value = content.length > 1 ? content[1] : i + '';
            //            var text = content[0];
            //            html += '<option value="' + value + '" ' + (default_value_value[0] == value ? 'selected' : '') + '>' + text + '</option>';
            //        });
            //        html += '</select>';
            //        $new = $(html).attr({
            //            name: $default_value.attr('name'),
            //            id: $default_value.attr('id')
            //        });
            //    } else if (type == 'checkbox') {
            //        var html = '<input type="hidden" size="1" name="' + $default_value.attr('name') + '" value=""  />';
            //        $.each(choices.split("\n"), function(i, choice) {
            //            html += '<label><input type="checkbox" class="checkbox" size="1" value="' + i + '" ' + (-1 !== $.inArray(choice, default_value_value) ? 'checked' : '') + '> ' + choice + '</label><br />';
            //        });
            //        $new = $(html);
            //    } else {
            //        var html_type = (-1 !== $.inArray(type, ['email', 'number', 'date']) ? type : 'text');
            //        $new = $(type == 'textarea' ? '<textarea rows="3" />' : '<input type="' + html_type + '" />').attr({
            //            name: $default_value.attr('name'),
            //            id: $default_value.attr('id')
            //        }).val(default_value_value);
            //    }
            //    var $parent = $default_value.closest('span');
            //    $parent.empty().append($new).nosFormUI();
            //
            //    var $checkboxes = $new.find('input.checkbox');
            //    $checkboxes.on('change', function(e) {
            //        var value = [];
            //        $checkboxes.filter(':checked').each(function() {
            //            value.push($(this).val());
            //        });
            //        $new.first().val(value.join(','));
            //        // Event doesn't seems to trigger with the hidden field on a delegated handler
            //        refreshFieldPreviewContent($(this));
            //    });
            //    $checkboxes.first().trigger('change');
            //}

            // Firefox needs this <colgroup> to size the td[colspan] properly
            //$preview_container.closest('table').prepend($('<colgroup><col width="' + col_size + '" /><col width="' + col_size + '" /><col width="' + col_size + '" /><col width="' + col_size + '" /></colgroup>'));
        };
    });
