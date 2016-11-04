function init_form_condition(json) {
    $(document).ready(function() {
        check_option(json);
    });
    $('[name^="'+json.inputname+'"]').on('keyup input change', function() {
        check_option(json);
    });

};

//handler
function check_option(json) {
    var $conditionnal_input = $('[name^="'+json.condition+'"]');
    if ($conditionnal_input.data('required') == undefined) {
        if ($conditionnal_input.attr('required') == undefined) {
            $conditionnal_input.data('required', '');
        } else {
            $conditionnal_input.data('required', $conditionnal_input.attr('required'));
        }
    }

    var todo = 'nothing';
    var $input = $('[name="'+json.inputname+'"]');
    if ($input) {
        switch ($input.prop('tagName')) {
            case "radio":
                if ($input.is('[value="'+json.value+'"]:checked')) {
                    todo = 'show';
                } else {
                    todo = 'hide';
                }
                break;
            case "checkbox":
                if ($input.is('[value="'+json.value+'"]:checked')) {
                    todo = 'show';
                } else {
                    todo = 'hide';
                }
                break;
            default:
                if ($input.val() == json.value) {
                    todo = 'show';
                } else {
                    todo = 'hide';
                }
        }
    }

    var $conditionnal_elements = $conditionnal_input.closest('.nos_form_field');
    switch (todo) {
        case 'show' :
            $conditionnal_elements.removeClass('nos_form_disabled').addClass('nos_form_enabled');
            if ($conditionnal_input.data('required') != '') {
                $conditionnal_input.attr('required', 'required');
            }
            break;
        case 'hide' :
            $conditionnal_elements.addClass('nos_form_disabled').removeClass('nos_form_enabled');
            if ($conditionnal_input.data('required') != '') {
                $conditionnal_input.removeAttr('required');
            }
            break;
    }
};
